# ASL Sign Language Model

This directory contains the TensorFlow.js model files for ASL alphabet classification.

## Model Format

The model should be in TensorFlow.js Layers format, consisting of:
- `model.json` - Model architecture and weights manifest
- `weights/` - Directory containing weight shard files (e.g., `weights_1.bin`, `weights_2.bin`)

## Model Requirements

### Input Shape
- **Static (alphabet)**: `[1, 63]` - Single frame: 21 hand landmarks × 3 coordinates (x, y, z)
- **Temporal (words)**: `[1, sequence_length, 63]` - Sequence of frames (15-30 frames recommended)

### Output Shape
- `[1, 26]` - Probability distribution over 26 classes (A-Z)

### Input Data Format
Landmarks are normalized coordinates from MediaPipe Hands (0-1 range):
- Flattened format: `[x1, y1, z1, x2, y2, z2, ..., x21, y21, z21]`
- 21 landmarks per hand (MediaPipe standard)

## Getting a Model

### Option 1: Use a Pre-trained Model
1. Find a TensorFlow.js ASL alphabet classifier (e.g., from GitHub, TensorFlow Hub, or model zoo)
2. Place `model.json` and `weights/` directory in this folder
3. Update model path in `ml/sign-language/sign-recognition.js` if needed

### Option 2: Train Your Own
1. Collect ASL hand landmark data (MediaPipe Hands output)
2. Train a model using TensorFlow/Keras
3. Convert to TensorFlow.js:
   ```bash
   tensorflowjs_converter --input_format keras model.h5 ./model/
   ```
4. Copy `model.json` and `weights/` to this directory

### Option 3: Convert from PyTorch/ONNX
1. Convert PyTorch model to ONNX
2. Convert ONNX to TensorFlow.js using `tfjs-converter`
3. Place files in this directory

## Example Model Sources

- **TensorFlow.js Model Zoo**: Check for sign language models
- **GitHub**: Search for "ASL TensorFlow.js" or "sign language classification"
- **Custom Training**: Use MediaPipe Hands landmarks to train your own classifier

## Testing Without a Model

The system will work with MediaPipe Hands detection even without a classification model. Hand detection will function, but classification requires a model file.

## Model Configuration

Update `MODEL_CONFIG` in `ml/sign-language/sign-recognition.js` to:
- Change model path (`localPath` or `cdnPath`)
- Switch between static/temporal modes (`useTemporal`)
- Adjust input shape if using a different model format

## Notes

- Model files are large and should not be committed to git
- Use Git LFS for model files if needed
- Consider CDN hosting for production deployments
- Ensure model is optimized for browser inference (quantization recommended)

