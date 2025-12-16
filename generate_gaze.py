#!/usr/bin/env python3
"""
Gaze Grid Generator for web app - outputs progress to stdout for Socket.IO
"""

import os
import sys
import argparse
from pathlib import Path
import numpy as np
import torch
import cv2
from PIL import Image
import json

# Add LivePortrait to path (relative to this file's directory)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LIVEPORTRAIT_PATH = os.environ.get('LIVEPORTRAIT_PATH', os.path.join(SCRIPT_DIR, 'lib', 'LivePortrait'))
sys.path.insert(0, LIVEPORTRAIT_PATH)

from src.config.inference_config import InferenceConfig
from src.config.crop_config import CropConfig
from src.live_portrait_wrapper import LivePortraitWrapper
from src.utils.cropper import Cropper
from src.utils.io import load_img_online
from src.utils.crop import prepare_paste_back, paste_back as paste_back_fn
from src.utils.camera import get_rotation_matrix


class BackgroundRemover:
    """Background removal using rembg"""

    def __init__(self):
        self.session = None

    def load(self):
        if self.session is None:
            print("STAGE:loading_rembg:Loading background removal model...", flush=True)
            from rembg import new_session
            # Use u2net for good quality, or isnet-general-use for faster
            self.session = new_session("u2net")
            print("STAGE:rembg_loaded:Background removal model loaded", flush=True)

    def remove_background(self, img_rgb):
        """Remove background from RGB numpy array, return RGBA numpy array"""
        from rembg import remove

        # Convert numpy to PIL
        pil_img = Image.fromarray(img_rgb)

        # Remove background (returns RGBA)
        result = remove(pil_img, session=self.session)

        # Convert back to numpy RGBA
        return np.array(result)

    def remove_background_batch(self, images, progress_callback=None):
        """Remove background from a list of RGB numpy arrays"""
        results = []
        for i, img in enumerate(images):
            result = self.remove_background(img)
            results.append(result)
            if progress_callback:
                progress_callback(i + 1, len(images))
        return results


class GazeGridGeneratorWeb:
    """Generate a grid of images with varying gaze directions"""

    def __init__(self, device='cuda', remove_background=False):
        self.device = device
        self.inference_cfg = InferenceConfig()
        self.crop_cfg = CropConfig()
        self.remove_background = remove_background
        self.bg_remover = None

        print("STAGE:loading:Loading LivePortrait models...", flush=True)
        self.live_portrait_wrapper = LivePortraitWrapper(self.inference_cfg)
        self.cropper = Cropper(crop_cfg=self.crop_cfg)
        print("STAGE:models_loaded:Models loaded successfully!", flush=True)

        if remove_background:
            self.bg_remover = BackgroundRemover()
            self.bg_remover.load()

    @torch.no_grad()
    def prepare_source(self, input_image_path, scale=2.3):
        """Prepare source image for retargeting"""
        self.crop_cfg.scale = scale
        self.cropper.update_config({'scale': scale})

        img_rgb = load_img_online(input_image_path, mode='rgb', max_dim=1280, n=2)

        crop_info = self.cropper.crop_source_image(img_rgb, self.crop_cfg)
        if crop_info is None:
            raise ValueError("No face detected in the source image")

        I_s = self.live_portrait_wrapper.prepare_source(crop_info['img_crop_256x256'])
        source_lmk = crop_info['lmk_crop']
        crop_M_c2o = crop_info['M_c2o']
        mask_ori = prepare_paste_back(
            self.inference_cfg.mask_crop,
            crop_info['M_c2o'],
            dsize=(img_rgb.shape[1], img_rgb.shape[0])
        )

        x_s_info = self.live_portrait_wrapper.get_kp_info(I_s)
        f_s = self.live_portrait_wrapper.extract_feature_3d(I_s)
        x_s = self.live_portrait_wrapper.transform_keypoint(x_s_info)
        R_s = get_rotation_matrix(x_s_info['pitch'], x_s_info['yaw'], x_s_info['roll'])

        return {
            'f_s': f_s,
            'x_s': x_s,
            'R_s': R_s,
            'x_s_info': x_s_info,
            'source_lmk': source_lmk,
            'crop_M_c2o': crop_M_c2o,
            'mask_ori': mask_ori,
            'img_rgb': img_rgb
        }

    @torch.no_grad()
    def generate_batch(self, source_data, batch_params, paste_back=True):
        """Generate a batch of images with different gaze parameters"""
        device = self.live_portrait_wrapper.device
        batch_size = len(batch_params)

        f_s = source_data['f_s'].to(device)
        x_s = source_data['x_s'].to(device)
        R_s = source_data['R_s'].to(device)
        x_s_info = source_data['x_s_info']

        f_s_batch = f_s.expand(batch_size, -1, -1, -1, -1)
        x_s_batch = x_s.expand(batch_size, -1, -1)
        R_s_batch = R_s.expand(batch_size, -1, -1)

        x_c_s = x_s_info['kp'].to(device).expand(batch_size, -1, -1)
        delta_base = x_s_info['exp'].to(device)
        scale = x_s_info['scale'].to(device)
        t = x_s_info['t'].to(device)

        pitches = []
        yaws = []
        rolls = []
        delta_batch = []

        for params in batch_params:
            pitch = x_s_info['pitch'] + params['head_pitch']
            yaw = x_s_info['yaw'] + params['head_yaw']
            roll = x_s_info['roll']
            pitches.append(pitch)
            yaws.append(yaw)
            rolls.append(roll)

            delta_new = delta_base.clone()
            ex, ey = params['pupil_x'], params['pupil_y']
            if ex != 0 or ey != 0:
                if ex > 0:
                    delta_new[0, 11, 0] += ex * 0.0007
                    delta_new[0, 15, 0] += ex * 0.001
                else:
                    delta_new[0, 11, 0] += ex * 0.001
                    delta_new[0, 15, 0] += ex * 0.0007
                delta_new[0, 11, 1] += ey * -0.001
                delta_new[0, 15, 1] += ey * -0.001
                blink = -ey / 2.
                delta_new[0, 11, 1] += blink * -0.001
                delta_new[0, 13, 1] += blink * 0.0003
                delta_new[0, 15, 1] += blink * -0.001
                delta_new[0, 16, 1] += blink * 0.0003

            eb = params['eyebrow']
            if eb != 0:
                if eb > 0:
                    delta_new[0, 1, 1] += eb * 0.001
                    delta_new[0, 2, 1] += eb * -0.001
                else:
                    delta_new[0, 1, 0] += eb * -0.001
                    delta_new[0, 2, 0] += eb * 0.001
                    delta_new[0, 1, 1] += eb * 0.0003
                    delta_new[0, 2, 1] += eb * -0.0003

            delta_batch.append(delta_new)

        delta_batch = torch.cat(delta_batch, dim=0)
        pitches = torch.cat(pitches, dim=0)
        yaws = torch.cat(yaws, dim=0)
        rolls = torch.cat(rolls, dim=0)
        R_d_batch = get_rotation_matrix(pitches, yaws, rolls)

        R_d_new = torch.bmm(torch.bmm(R_d_batch, R_s_batch.permute(0, 2, 1)), R_s_batch)
        x_d_new = scale * (torch.bmm(x_c_s, R_d_new) + delta_batch) + t

        x_d_stitched = []
        for i in range(batch_size):
            x_d_i = self.live_portrait_wrapper.stitching(x_s_batch[i:i+1], x_d_new[i:i+1])
            x_d_stitched.append(x_d_i)
        x_d_new = torch.cat(x_d_stitched, dim=0)

        out_images = []
        for i in range(batch_size):
            out = self.live_portrait_wrapper.warp_decode(f_s_batch[i:i+1], x_s_batch[i:i+1], x_d_new[i:i+1])
            out_img = self.live_portrait_wrapper.parse_output(out['out'])[0]

            if paste_back and source_data['crop_M_c2o'] is not None:
                out_img = paste_back_fn(
                    out_img,
                    source_data['crop_M_c2o'],
                    source_data['img_rgb'],
                    source_data['mask_ori']
                )
            out_images.append(out_img)

        return out_images

    def generate_grid(self, input_image_path, output_dir, sprite_output, grid_size=30, batch_size=8, progress_callback=None):
        """Generate grid of images and create both 30x30 and 20x20 sprite sheets"""
        os.makedirs(output_dir, exist_ok=True)
        total_images = grid_size * grid_size

        def report_progress(stage, current, total, message):
            print(f"STAGE:{stage}:{message}", flush=True)
            if progress_callback:
                progress_callback(stage, current, total, message)

        report_progress("preparing", 0, total_images, "Preparing source image...")
        source_data = self.prepare_source(input_image_path, scale=2.3)

        # Calculate step to get grid_size points from -15 to 15
        step = 30 / (grid_size - 1)
        values = [round(-15 + i * step, 2) for i in range(grid_size)]

        all_params = []
        for y in values:
            for x in values:
                pupil_x = float(x)
                pupil_y = float(y) * -1
                head_pitch = float(y) / 2
                head_yaw = float(x) / 2 * -1
                eyebrow = max(0, float(y) * -1)

                all_params.append({
                    'x': x,
                    'y': y,
                    'pupil_x': pupil_x,
                    'pupil_y': pupil_y,
                    'head_pitch': head_pitch,
                    'head_yaw': head_yaw,
                    'eyebrow': eyebrow
                })

        report_progress("generating", 0, total_images, f"Generating {total_images} images ({grid_size}x{grid_size} grid)")

        generated_images = []
        for i in range(0, total_images, batch_size):
            batch_params = all_params[i:i+batch_size]
            out_images = self.generate_batch(source_data, batch_params, paste_back=True)

            for j, (params, out_img) in enumerate(zip(batch_params, out_images)):
                generated_images.append((params['x'], params['y'], out_img))

            current = i + len(batch_params)
            progress = min(100, int(current / total_images * 100))
            print(f"PROGRESS:{progress}", flush=True)
            if progress_callback:
                progress_callback("generating", current, total_images, f"Generated {current}/{total_images} images ({progress}%)")

        # Background removal if enabled
        if self.remove_background and self.bg_remover:
            report_progress("removing_bg", 0, total_images, "Removing backgrounds...")
            total_for_bg = len(generated_images)

            processed_images = []
            for idx, (x_val, y_val, img) in enumerate(generated_images):
                rgba_img = self.bg_remover.remove_background(img)
                processed_images.append((x_val, y_val, rgba_img))
                bg_progress = int((idx + 1) / total_for_bg * 100)
                print(f"PROGRESS_BG:{bg_progress}", flush=True)
                if progress_callback:
                    progress_callback("removing_bg", idx + 1, total_for_bg, f"Removing background {idx + 1}/{total_for_bg} ({bg_progress}%)")

            generated_images = processed_images

        first_img = generated_images[0][2]
        img_h, img_w = first_img.shape[:2]
        has_alpha = first_img.shape[2] == 4 if len(first_img.shape) > 2 else False

        # Build a lookup for quick access by row/col
        image_grid = {}
        for x_val, y_val, img in generated_images:
            col = values.index(x_val)
            row = values.index(y_val)
            image_grid[(row, col)] = img

        # Create sprite sheets using FFmpeg for better performance
        import tempfile
        import subprocess
        import shutil

        report_progress("saving", 0, 8, "Creating sprite sheets with FFmpeg (30x30 and 20x20)...")

        # Create temp directory for individual frames
        temp_base = tempfile.mkdtemp(prefix="gaze_frames_")

        try:
            # Helper function to create quadrant sprites using FFmpeg
            def create_quadrant_ffmpeg(target_grid_size, suffix="", progress_offset=0):
                half = target_grid_size // 2

                # Map from target grid indices to source (30x30) indices
                if target_grid_size == grid_size:
                    index_map = list(range(grid_size))
                else:
                    # Subsample: pick evenly spaced indices
                    index_map = [round(i * (grid_size - 1) / (target_grid_size - 1)) for i in range(target_grid_size)]

                quadrants = [
                    ('q0', 0, 0),           # top-left
                    ('q1', 0, half),        # top-right
                    ('q2', half, 0),        # bottom-left
                    ('q3', half, half),     # bottom-right
                ]

                for q_idx, (q_name, row_start, col_start) in enumerate(quadrants):
                    # Create temp dir for this quadrant's frames
                    q_temp = os.path.join(temp_base, f"{q_name}{suffix}")
                    os.makedirs(q_temp, exist_ok=True)

                    # Save frames in row-major order (top-left to bottom-right)
                    frame_num = 0
                    for local_row in range(half):
                        for local_col in range(half):
                            target_row = row_start + local_row
                            target_col = col_start + local_col

                            source_row = index_map[target_row]
                            source_col = index_map[target_col]

                            if (source_row, source_col) in image_grid:
                                img = image_grid[(source_row, source_col)]
                                frame_path = os.path.join(q_temp, f"frame_{frame_num:04d}.png")

                                if has_alpha:
                                    pil_img = Image.fromarray(img, 'RGBA')
                                else:
                                    pil_img = Image.fromarray(img, 'RGB')
                                pil_img.save(frame_path, 'PNG')

                            frame_num += 1

                    # Use FFmpeg to create tiled sprite sheet
                    output_path = os.path.join(output_dir, f'{q_name}{suffix}.webp')
                    ffmpeg_cmd = [
                        'ffmpeg', '-y',
                        '-framerate', '1',  # Doesn't matter for tile, but required
                        '-i', os.path.join(q_temp, 'frame_%04d.png'),
                        '-vf', f'tile={half}x{half}',
                        '-c:v', 'libwebp',
                        '-q:v', '85',
                        '-lossless', '0',
                        output_path
                    ]

                    try:
                        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
                        if result.returncode != 0:
                            print(f"FFmpeg failed for {q_name}{suffix}, using PIL fallback. Error: {result.stderr}", flush=True)
                            # Fallback to PIL if FFmpeg fails
                            create_quadrant_pil(target_grid_size, suffix, q_idx, q_name, row_start, col_start, index_map, half)
                        else:
                            print(f"FFmpeg created {q_name}{suffix}.webp successfully", flush=True)
                    except FileNotFoundError:
                        print(f"FFmpeg not found, using PIL fallback for {q_name}{suffix}", flush=True)
                        create_quadrant_pil(target_grid_size, suffix, q_idx, q_name, row_start, col_start, index_map, half)

                    # Progress: 4 for 30x30 + 4 for 20x20 = 8 total
                    current_progress = q_idx + 1 + progress_offset
                    print(f"PROGRESS_SAVE:{int(current_progress / 8 * 100)}", flush=True)

            # PIL fallback for when FFmpeg fails
            def create_quadrant_pil(target_grid_size, suffix, q_idx, q_name, row_start, col_start, index_map, half):
                sprite_w = img_w * half
                sprite_h = img_h * half

                if has_alpha:
                    sprite = np.zeros((sprite_h, sprite_w, 4), dtype=np.uint8)
                else:
                    sprite = np.zeros((sprite_h, sprite_w, 3), dtype=np.uint8)

                for local_row in range(half):
                    for local_col in range(half):
                        target_row = row_start + local_row
                        target_col = col_start + local_col
                        source_row = index_map[target_row]
                        source_col = index_map[target_col]

                        if (source_row, source_col) in image_grid:
                            img = image_grid[(source_row, source_col)]
                            y_pos = local_row * img_h
                            x_pos = local_col * img_w
                            sprite[y_pos:y_pos+img_h, x_pos:x_pos+img_w] = img

                filename = f'{q_name}{suffix}.webp'
                sprite_path = os.path.join(output_dir, filename)
                if has_alpha:
                    pil_sprite = Image.fromarray(sprite, 'RGBA')
                else:
                    pil_sprite = Image.fromarray(sprite, 'RGB')
                pil_sprite.save(sprite_path, 'WEBP', quality=85)

            # Create 30x30 quadrants (q0.webp, q1.webp, q2.webp, q3.webp)
            create_quadrant_ffmpeg(grid_size, suffix="", progress_offset=0)

            # Create 20x20 quadrants (q0_20.webp, q1_20.webp, q2_20.webp, q3_20.webp)
            mobile_grid_size = 20
            create_quadrant_ffmpeg(mobile_grid_size, suffix="_20", progress_offset=4)

        finally:
            # Clean up temp directory
            shutil.rmtree(temp_base, ignore_errors=True)

        # Save metadata with both grid sizes
        metadata_path = os.path.join(output_dir, 'metadata.json')
        metadata = {
            'gridSize': grid_size,
            'quadrantSize': grid_size // 2,
            'mobileGridSize': mobile_grid_size,
            'mobileQuadrantSize': mobile_grid_size // 2,
            'imageWidth': img_w,
            'imageHeight': img_h,
            'hasAlpha': has_alpha,
            'format': 'webp',
            'mode': 'quadrants',
            'totalImages': total_images
        }

        with open(metadata_path, 'w') as f:
            json.dump(metadata, f)

        print(f"COMPLETE:{output_dir}", flush=True)
        return generated_images


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--sprite-output', required=True)
    parser.add_argument('--grid-size', type=int, default=30)
    parser.add_argument('--socket-id', default='')
    parser.add_argument('--batch-size', type=int, default=8)
    parser.add_argument('--remove-background', action='store_true', help='Remove background from images')

    args = parser.parse_args()

    generator = GazeGridGeneratorWeb(remove_background=args.remove_background)
    generator.generate_grid(
        input_image_path=args.input,
        output_dir=args.output,
        sprite_output=args.sprite_output,
        grid_size=args.grid_size,
        batch_size=args.batch_size
    )


if __name__ == '__main__':
    main()
