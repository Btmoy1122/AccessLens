# Contributing to AccessLens

## Getting Started

1. Read the [Setup Guide](./docs/SETUP.md)
2. Review the [Timeline](./docs/TIMELINE.md) for current priorities
3. Check [Team Roles](./TEAM.md) for your responsibilities
4. Pick a feature from [Features Documentation](./docs/FEATURES.md)

## Development Workflow

### 1. Pick a Task
- Check `docs/TIMELINE.md` for current phase
- Assign yourself to a feature or bug
- Update timeline status if needed

### 2. Create a Branch
```bash
git checkout -b feature/your-feature-name
```

### 3. Develop
- Follow existing code structure
- Add comments for complex logic
- Test on multiple devices if possible

### 4. Test
- Test your feature thoroughly
- Check browser compatibility
- Verify accessibility features work

### 5. Commit
```bash
git add .
git commit -m "feat: Add your feature description"
```

### 6. Push and Create PR
```bash
git push origin feature/your-feature-name
```

## Code Style

### JavaScript
- Use ES6+ features
- Use meaningful variable names
- Add comments for complex logic
- Keep functions focused and small

### HTML/CSS
- Use semantic HTML
- Follow accessibility guidelines (ARIA labels)
- Use responsive design principles

## Commit Messages

Use conventional commits:
- `feat: Add speech-to-text captions`
- `fix: Camera permission handling`
- `docs: Update setup guide`
- `refactor: Improve face recognition logic`

## Testing

### Manual Testing
- Test on Chrome/Edge (recommended)
- Test on mobile devices
- Verify camera access works
- Check all feature toggles

### Browser Support
- Chrome/Edge (primary)
- Firefox (secondary)
- Safari (if time permits)

## Accessibility

- Ensure keyboard navigation works
- Add ARIA labels where needed
- Test with screen readers
- Verify high contrast mode works

## Questions?

- Check documentation in `docs/` folder
- Ask team members (see `TEAM.md`)
- Create an issue for bugs

## Hackathon Priorities

1. **Functionality over perfection** - Get features working first
2. **Demo-ready** - Focus on features that demo well
3. **Documentation** - Keep docs updated as you go
4. **Team communication** - Update others on progress

