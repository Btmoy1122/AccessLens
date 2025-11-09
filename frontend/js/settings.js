/**
 * Settings Page Logic
 * Handles user preferences and face management
 */

import { getCurrentUser, onAuthStateChange, signOutUser } from '@backend/services/auth-service.js';
import { getUserPreferences, updateUserPreferences, deleteUserAccount } from '@backend/services/user-service.js';
import { getFacesByUser, deleteFace } from '@backend/services/face-service.js';

// DOM Elements
const accessibilityProfile = document.getElementById('accessibility-profile');
const featureSpeech = document.getElementById('feature-speech');
const featureScene = document.getElementById('feature-scene');
const featureFace = document.getElementById('feature-face');
const fontSize = document.getElementById('font-size');
const highContrast = document.getElementById('high-contrast');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const saveStatus = document.getElementById('save-status');
const facesLoading = document.getElementById('faces-loading');
const facesEmpty = document.getElementById('faces-empty');
const facesList = document.getElementById('faces-list');
const deleteAccountBtn = document.getElementById('delete-account-btn');

let currentUser = null;
let userPreferences = null;

// Check authentication or guest mode
onAuthStateChange((user) => {
    // Check for guest mode
    const isGuestMode = sessionStorage.getItem('guestMode') === 'true';
    const guestUserId = sessionStorage.getItem('guestUserId');
    
    if (!user && !isGuestMode) {
        // Not logged in and not guest, redirect to login
        window.location.href = '/login.html';
        return;
    }
    
    if (isGuestMode && guestUserId) {
        // Guest mode - show message that settings aren't saved
        currentUser = {
            uid: guestUserId,
            email: null,
            displayName: 'Guest',
            isGuest: true
        };
        // Show guest mode notice
        showGuestModeNotice();
    } else if (user) {
        currentUser = user;
    }
    
    loadSettings();
});

function showGuestModeNotice() {
    // Add a notice at the top of settings page
    const settingsContent = document.querySelector('.settings-content');
    if (settingsContent) {
        const notice = document.createElement('div');
        notice.className = 'guest-notice';
        notice.style.cssText = 'background: #ff9800; color: white; padding: 12px; margin-bottom: 20px; border-radius: 4px;';
        notice.innerHTML = `
            <strong>👤 Guest Mode</strong>
            <p style="margin: 8px 0 0 0; font-size: 14px;">
                You're viewing as a guest. Settings won't be saved. 
                <a href="/login.html" style="color: white; text-decoration: underline;">Sign in</a> to save your preferences.
            </p>
        `;
        settingsContent.insertBefore(notice, settingsContent.firstChild);
    }
}

async function loadSettings() {
    if (!currentUser) return;
    
    try {
        // Load user preferences
        userPreferences = await getUserPreferences(currentUser.uid);
        populateSettingsForm(userPreferences);
        
        // Load faces
        await loadFaces();
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function populateSettingsForm(prefs) {
    if (!prefs) return;
    
    // Accessibility profile
    if (accessibilityProfile && prefs.accessibilityProfile) {
        accessibilityProfile.value = prefs.accessibilityProfile;
    }
    
    // Feature preferences
    if (featureSpeech) featureSpeech.checked = prefs.enabledFeatures?.speech !== false;
    if (featureScene) featureScene.checked = prefs.enabledFeatures?.scene !== false;
    if (featureFace) featureFace.checked = prefs.enabledFeatures?.face !== false;
    
    // UI preferences
    if (fontSize && prefs.fontSize) {
        fontSize.value = prefs.fontSize;
    }
    if (highContrast) {
        highContrast.checked = prefs.highContrast === true;
    }
}

async function loadFaces() {
    try {
        if (facesLoading) facesLoading.style.display = 'block';
        if (facesEmpty) facesEmpty.style.display = 'none';
        
        // Clear existing faces
        const existingFaces = facesList?.querySelectorAll('.face-item');
        if (existingFaces) {
            existingFaces.forEach(face => face.remove());
        }
        
        // Get faces for this user only (server-side filtered)
        const userFaces = await getFacesByUser(currentUser.uid);
        
        if (userFaces.length === 0) {
            if (facesLoading) facesLoading.style.display = 'none';
            if (facesEmpty) facesEmpty.style.display = 'block';
            return;
        }
        
        // Render faces
        if (facesList) {
            userFaces.forEach(face => {
                const faceItem = createFaceItem(face);
                facesList.appendChild(faceItem);
            });
        }
        
        if (facesLoading) facesLoading.style.display = 'none';
    } catch (error) {
        console.error('Error loading faces:', error);
        if (facesLoading) facesLoading.style.display = 'none';
        if (facesEmpty) {
            facesEmpty.textContent = 'Error loading faces. Please try again.';
            facesEmpty.style.display = 'block';
        }
    }
}

function createFaceItem(face) {
    const div = document.createElement('div');
    div.className = 'face-item';
    div.dataset.faceId = face.id;
    
    const name = face.name || 'Unknown';
    const notes = face.memorySummary || face.notes || 'No notes';
    
    div.innerHTML = `
        <div class="face-item-content">
            <div class="face-item-info">
                <h3>${name}</h3>
                <p class="face-item-notes">${notes}</p>
            </div>
            <button class="btn-delete" data-face-id="${face.id}" title="Delete">
                <i data-lucide="trash-2"></i>
            </button>
        </div>
    `;
    
    // Re-initialize Lucide icons after adding new element
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Add delete button handler
    const deleteBtn = div.querySelector('.btn-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (confirm(`Are you sure you want to delete ${name}?`)) {
                try {
                    await deleteFace(face.id);
                    div.remove();
                    
                    // Check if no faces left
                    const remainingFaces = facesList?.querySelectorAll('.face-item');
                    if (!remainingFaces || remainingFaces.length === 0) {
                        if (facesEmpty) facesEmpty.style.display = 'block';
                    }
                } catch (error) {
                    console.error('Error deleting face:', error);
                    alert('Error deleting face. Please try again.');
                }
            }
        });
    }
    
    return div;
}

// Save settings
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
        if (!currentUser) return;
        
        // Check if guest mode
        if (currentUser.isGuest) {
            showSaveStatus('Guest mode: Settings cannot be saved. Please sign in to save preferences.', 'error');
            return;
        }
        
        try {
            saveSettingsBtn.disabled = true;
            showSaveStatus('Saving...', 'info');
            
            // Collect preferences from form
            const preferences = {
                accessibilityProfile: accessibilityProfile?.value || null,
                enabledFeatures: {
                    speech: featureSpeech?.checked !== false,
                    scene: featureScene?.checked !== false,
                    face: featureFace?.checked !== false
                },
                fontSize: fontSize?.value || 'medium',
                highContrast: highContrast?.checked === true,
                language: 'en-US',
                speechSpeed: 1.0,
                narrationEnabled: true
            };
            
            // Update preferences
            await updateUserPreferences(currentUser.uid, preferences);
            
            showSaveStatus('Settings saved successfully!', 'success');
            setTimeout(() => {
                hideSaveStatus();
            }, 3000);
        } catch (error) {
            console.error('Error saving settings:', error);
            showSaveStatus('Error saving settings. Please try again.', 'error');
        } finally {
            saveSettingsBtn.disabled = false;
        }
    });
}

function showSaveStatus(message, type) {
    if (saveStatus) {
        saveStatus.textContent = message;
        saveStatus.className = `save-status ${type}`;
        saveStatus.style.display = 'block';
    }
}

function hideSaveStatus() {
    if (saveStatus) {
        saveStatus.style.display = 'none';
    }
}

// Delete account handler
if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', async () => {
        if (!currentUser || currentUser.isGuest) {
            alert('Cannot delete guest account. Please sign in to delete an account.');
            return;
        }
        
        const confirmMessage = `Are you sure you want to delete your account?\n\nThis will permanently delete:\n- Your profile and preferences\n- All registered faces\n- All memories and interactions\n- Your Firebase Auth account\n\nThis action cannot be undone!`;
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        // Double confirmation for safety
        const doubleConfirm = prompt('Type "DELETE" to confirm account deletion:');
        if (doubleConfirm !== 'DELETE') {
            alert('Account deletion cancelled.');
            return;
        }
        
        try {
            // Disable button
            deleteAccountBtn.disabled = true;
            deleteAccountBtn.textContent = 'Deleting...';
            
            // Show status
            if (saveStatus) {
                saveStatus.textContent = 'Deleting account and all data...';
                saveStatus.className = 'save-status info';
                saveStatus.style.display = 'block';
            }
            
            // Delete user account and all data
            const result = await deleteUserAccount(currentUser.uid, true);
            
            console.log(`Account deleted: ${result.deletedCount} documents removed`);
            
            // Show success message
            if (saveStatus) {
                saveStatus.textContent = `Account deleted successfully. Redirecting to login...`;
                saveStatus.className = 'save-status success';
            }
            
            // Sign out (if not already done by deleteUserAccount)
            try {
                await signOutUser();
            } catch (signOutError) {
                console.warn('Error signing out (may already be signed out):', signOutError);
            }
            
            // Clear session storage
            sessionStorage.clear();
            
            // Redirect to login after a short delay
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        } catch (error) {
            console.error('Error deleting account:', error);
            
            // Re-enable button
            deleteAccountBtn.disabled = false;
            deleteAccountBtn.innerHTML = '<i data-lucide="trash-2" class="btn-icon-small"></i><span>Delete Account</span>';
            // Re-initialize icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            
            // Show error
            if (saveStatus) {
                saveStatus.textContent = 'Error deleting account. Please try again or contact support.';
                saveStatus.className = 'save-status error';
                saveStatus.style.display = 'block';
            }
            alert('Error deleting account: ' + (error.message || 'Unknown error'));
        }
    });
}

