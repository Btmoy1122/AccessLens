# Backend Services Directory

This directory contains backend services and Firebase integration.

## Structure

```
backend/
├── config/              # Configuration files
│   └── firebase-config.js
├── services/            # Service modules
│   ├── face-service.js
│   └── user-service.js
└── auth/                # Authentication (if needed)
```

## Services

### Face Service (`services/face-service.js`)
- Add face to database
- Get all faces
- Get faces by user
- Update face data
- Delete face

### User Service (`services/user-service.js`)
- Get user preferences
- Update user preferences
- Create user profile

## Firebase Setup

1. Create Firebase project
2. Enable Firestore
3. Copy config to `config/firebase-config.js`
4. See `docs/FIREBASE_SETUP.md` for detailed instructions

## Database Schema

### `faces` Collection
```javascript
{
  id: string,
  name: string,
  notes: string,
  embedding: number[],
  createdAt: timestamp,
  userId: string
}
```

### `users` Collection
```javascript
{
  id: string,
  preferences: {
    fontSize: string,
    speechSpeed: number,
    enabledFeatures: object,
    highContrast: boolean,
    language: string
  },
  createdAt: timestamp
}
```

## Security

- Update Firestore security rules before production
- Use environment variables for API keys
- Implement proper authentication if needed

