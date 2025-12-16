# Gaze Tracker Widget

A self-contained web component that displays an animated face that follows the user's cursor. Built with PixiJS for smooth WebGL-powered rendering.

## Quick Start

1. Include the widget script and your sprite image in your HTML:

```html
<script src="gaze-tracker.js"></script>
<gaze-tracker
    src="sprite.jpg"
    grid="30"
    width="512"
    height="640">
</gaze-tracker>
```

That's it! The face will automatically follow the cursor.

## Files Included

- `gaze-tracker.js` - The web component (includes PixiJS auto-loading)
- `sprite.jpg` - Your generated sprite sheet
- `sprite.json` - Metadata (grid size, dimensions)
- `README.md` - This file
- `example.html` - Working example

## Attributes

| Attribute | Description | Default |
|-----------|-------------|---------|
| `src` | Path to sprite sheet image | (required) |
| `grid` | Grid size (e.g., 30 for 30x30) | 30 |
| `width` | Width of each frame in pixels | 512 |
| `height` | Height of each frame in pixels | 640 |
| `smoothing` | Animation smoothness (0.01-0.5) | 0.12 |

## Sizing Behavior

The widget automatically fills its container using `object-fit: cover` with center positioning. This means:

- It will always fill the entire container
- The image will be cropped (not stretched) if aspect ratios don't match
- The face will remain centered

### Full Page Background

```html
<style>
  body, html { margin: 0; padding: 0; height: 100%; }
</style>
<gaze-tracker src="sprite.jpg" grid="30" width="512" height="640"
    style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1;">
</gaze-tracker>
```

### Fixed Size Container

```html
<div style="width: 400px; height: 500px; border-radius: 20px; overflow: hidden;">
    <gaze-tracker src="sprite.jpg" grid="30" width="512" height="640"></gaze-tracker>
</div>
```

### Responsive Container

```html
<div style="width: 100%; max-width: 600px; aspect-ratio: 4/5;">
    <gaze-tracker src="sprite.jpg" grid="30" width="512" height="640"></gaze-tracker>
</div>
```

### Hero Section

```html
<section style="height: 100vh; position: relative;">
    <gaze-tracker src="sprite.jpg" grid="30" width="512" height="640"
        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">
    </gaze-tracker>
    <div style="position: relative; z-index: 1; text-align: center; padding-top: 40vh;">
        <h1>Welcome</h1>
    </div>
</section>
```

## JavaScript API

You can also control the widget programmatically:

```javascript
const tracker = document.querySelector('gaze-tracker');

// Change the sprite source
tracker.setAttribute('src', 'new-sprite.jpg');

// Adjust smoothing (lower = smoother but laggier)
tracker.setAttribute('smoothing', '0.08');
```

## Browser Support

- Chrome 67+
- Firefox 63+
- Safari 14+
- Edge 79+

Requires WebGL support.

## Performance Tips

1. **Sprite size**: Keep sprite sheets under 16384x16384 pixels (GPU texture limit)
2. **Grid size**: 30x30 (900 frames) is a good balance of smoothness and file size
3. **Image format**: Use JPEG for photos, WebP for smaller file sizes
4. **Lazy loading**: The widget only loads when visible in the viewport

## Troubleshooting

### "Failed to initialize" error
- Check that your browser supports WebGL
- Ensure the sprite image path is correct

### Choppy animation
- Reduce the `smoothing` value (e.g., 0.08)
- Check that hardware acceleration is enabled in your browser

### Image doesn't fill container
- The widget uses `object-fit: cover` - this is intentional to maintain aspect ratio
- If you need stretching, you can override the canvas styles

## License

MIT License - Free for personal and commercial use.
