# Team Information

## Team Roles

### Frontend Developer
**Responsibilities**:
- A-Frame interface setup
- Camera access and AR overlay system
- UI controls and feature toggles
- User experience optimization

**Key Files**:
- `frontend/index.html`
- `frontend/ar/`
- `frontend/components/`

---

### ML Developer
**Responsibilities**:
- MediaPipe Hands integration
- TensorFlow.js model setup
- face-api.js integration
- Web Speech API integration
- Model training/optimization (if time permits)

**Key Files**:
- `ml/speech/`
- `ml/sign-language/`
- `ml/vision/`

---

### Backend Developer
**Responsibilities**:
- Firebase Firestore setup
- Database schema design
- Face data storage/retrieval
- User profile management
- API integration

**Key Files**:
- `backend/config/`
- `backend/services/`
- `backend/auth/`

---

### UX / Accessibility Lead
**Responsibilities**:
- Accessibility compliance
- UI/UX design
- Voice narration design
- User testing
- Feature toggle design

**Key Files**:
- `frontend/components/controls.js`
- `frontend/styles/`
- `docs/FEATURES.md`

---

## Communication

### Daily Standups
- **Frequency**: Every 4-6 hours during hackathon
- **Duration**: 5-10 minutes
- **Topics**: Progress, blockers, next steps

### Communication Channels
- GitHub Issues for bugs
- Pull Requests for code review
- Slack/Discord for quick questions

## Git Workflow

### Branch Strategy
- `main` - Production-ready code
- `dev` - Development branch
- `feature/feature-name` - Feature branches

### Commit Messages
- `feat: Add speech-to-text captions`
- `fix: Camera permission handling`
- `docs: Update setup guide`

## Code Review

- All PRs require at least one review
- Focus on functionality over perfection (hackathon timeline)
- Test on mobile devices before merging

## Deployment

- Deploy to Vercel/Netlify for demo
- Test on multiple devices
- Ensure HTTPS for camera access

