# ML Modules Directory

This directory contains all machine learning and recognition modules.

## Structure

```
ml/
├── speech/              # Speech-to-text recognition
│   └── speech-to-text.js
├── sign-language/       # Sign language recognition
│   └── sign-recognition.js
└── vision/              # Computer vision modules
    ├── face-recognition.js
    └── scene-description.js
```

## Modules

### Speech-to-Text (`speech/speech-to-text.js`)
- Web Speech API integration
- Real-time caption generation
- AR text overlay

### Sign Language (`sign-language/sign-recognition.js`)
- MediaPipe Hands integration
- TensorFlow.js gesture classification
- ASL recognition

### Face Recognition (`vision/face-recognition.js`)
- face-api.js integration
- Face embedding generation
- Known face matching
- Firebase integration

### Scene Description (`vision/scene-description.js`)
- TensorFlow.js COCO-SSD
- Object detection
- Emotion recognition
- Speech synthesis narration

## Dependencies

- MediaPipe Hands
- TensorFlow.js
- face-api.js
- Web Speech API
- Web Speech Synthesis API

## Setup

1. Install ML dependencies (see main README)
2. Download model files to `assets/ml-models/`
3. Initialize each module in `frontend/js/main.js`

