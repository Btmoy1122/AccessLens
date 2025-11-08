# Assets Directory

This directory contains static assets for the AccessLens project.

## Structure

```
assets/
├── images/          # Images and icons
├── models/          # 3D models (if needed)
├── ml-models/       # ML model files (TensorFlow.js, face-api.js, etc.)
└── icons/           # UI icons
```

## ML Models

### face-api.js Models
Download from: https://github.com/justadudewhohacks/face-api.js-models

Place in: `assets/ml-models/face-api/`

Required models:
- `tiny_face_detector_model-weights_manifest.json`
- `tiny_face_detector_model-shard1`
- `face_landmark_68_model-weights_manifest.json`
- `face_landmark_68_model-shard1`
- `face_recognition_model-weights_manifest.json`
- `face_recognition_model-shard1`

### TensorFlow.js Models
- Sign language model: Place in `assets/ml-models/sign-language/`
- COCO-SSD model: Will be loaded from CDN or place in `assets/ml-models/object-detection/`

## Notes

- Model files are large and should not be committed to git
- Use Git LFS for model files if needed
- Consider using CDN links for models in production

