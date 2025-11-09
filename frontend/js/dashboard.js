/**
 * Dashboard Page Logic
 * Shows memory log and navigation
 */

import { getCurrentUser, signOutUser, onAuthStateChange } from '@backend/services/auth-service.js';
import { getFacesByUser, getInteractionsByFace, hasSelfFace } from '@backend/services/face-service.js';

// DOM Elements
const userName = document.getElementById('user-name');
const settingsBtn = document.getElementById('settings-btn');
const logoutBtn = document.getElementById('logout-btn');
const memoryLoading = document.getElementById('memory-loading');
const memoryEmpty = document.getElementById('memory-empty');
const memoryList = document.getElementById('memory-list');

let currentUser = null;

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
        // Guest mode
        currentUser = {
            uid: guestUserId,
            email: null,
            displayName: 'Guest',
            isGuest: true
        };
    } else if (user) {
        currentUser = user;
    }
    
    loadDashboard();
});

async function loadDashboard() {
    if (!currentUser) return;
    
    // Update user name
    if (userName) {
        if (currentUser.isGuest) {
            userName.textContent = 'Guest';
            userName.style.fontStyle = 'italic';
            userName.style.opacity = '0.8';
        } else {
            userName.textContent = currentUser.displayName || currentUser.email || 'User';
        }
    }
    
    // Update logout button text for guests
    if (logoutBtn && currentUser.isGuest) {
        logoutBtn.title = 'Exit Guest Mode';
        logoutBtn.textContent = '🚪'; // Keep icon, but tooltip changes
    }
    
    // Check if user needs to register their face (skip for guests)
    if (!currentUser.isGuest) {
        try {
            const userHasSelfFace = await hasSelfFace(currentUser.uid);
            if (!userHasSelfFace) {
                // User needs to register their face - redirect to camera with flag
                const registerSelf = sessionStorage.getItem('registerSelfFace');
                if (registerSelf !== 'true') {
                    // Set flag and redirect to camera page for face registration
                    sessionStorage.setItem('registerSelfFace', 'true');
                    window.location.href = '/index.html';
                    return; // Don't load memories yet
                }
            } else {
                // User has registered their face - clear any registration flag
                sessionStorage.removeItem('registerSelfFace');
            }
        } catch (error) {
            console.error('Error checking self face:', error);
            // Continue to load dashboard even if check fails
        }
    }
    
    // Load memories
    await loadMemoryLog();
}

async function loadMemoryLog() {
    // Guest users can't load memories (they can't save them)
    if (currentUser?.isGuest) {
        if (memoryLoading) memoryLoading.style.display = 'none';
        if (memoryEmpty) {
            memoryEmpty.innerHTML = `
                <p>👤 <strong>Guest Mode</strong></p>
                <p>Memories are not available in guest mode. <a href="/login.html">Sign in</a> to save and view memories.</p>
            `;
            memoryEmpty.style.display = 'block';
        }
        return;
    }
    
    try {
        if (memoryLoading) memoryLoading.style.display = 'block';
        if (memoryEmpty) memoryEmpty.style.display = 'none';
        if (memoryList) memoryList.innerHTML = '';
        
        // Get faces for this user only (server-side filtered)
        const userFaces = await getFacesByUser(currentUser.uid);
        
        if (userFaces.length === 0) {
            if (memoryLoading) memoryLoading.style.display = 'none';
            if (memoryEmpty) memoryEmpty.style.display = 'block';
            return;
        }
        
        // Get interactions for each face
        const memoryItems = [];
        for (const face of userFaces) {
            const interactions = await getInteractionsByFace(face.id);
            if (interactions.length > 0) {
                memoryItems.push({
                    face: face,
                    interactions: interactions,
                    latestSummary: face.memorySummary || null
                });
            }
        }
        
        if (memoryItems.length === 0) {
            if (memoryLoading) memoryLoading.style.display = 'none';
            if (memoryEmpty) memoryEmpty.style.display = 'block';
            return;
        }
        
        // Render memory items
        if (memoryList) {
            memoryItems.forEach(item => {
                const memoryItem = createMemoryItem(item);
                memoryList.appendChild(memoryItem);
            });
        }
        
        if (memoryLoading) memoryLoading.style.display = 'none';
    } catch (error) {
        console.error('Error loading memory log:', error);
        if (memoryLoading) memoryLoading.style.display = 'none';
        if (memoryEmpty) {
            memoryEmpty.textContent = 'Error loading memories. Please try again.';
            memoryEmpty.style.display = 'block';
        }
    }
}

function createMemoryItem(item) {
    const div = document.createElement('div');
    div.className = 'memory-item';
    
    const faceName = item.face.name || 'Unknown';
    const summary = item.latestSummary || 'No summary yet';
    const memoryCount = item.interactions.length;
    const latestDate = item.interactions[0]?.createdAt?.toDate?.() || new Date();
    
    div.innerHTML = `
        <div class="memory-item-header">
            <h3>${faceName}</h3>
            <span class="memory-count">${memoryCount} ${memoryCount === 1 ? 'memory' : 'memories'}</span>
        </div>
        <p class="memory-summary">${summary}</p>
        <div class="memory-item-footer">
            <span class="memory-date">Last updated: ${formatDate(latestDate)}</span>
        </div>
    `;
    
    return div;
}

function formatDate(date) {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Settings button
if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        window.location.href = '/settings.html';
    });
}

// Logout button
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        // Handle guest mode logout
        if (currentUser?.isGuest) {
            // Clear guest mode and redirect to login
            sessionStorage.removeItem('guestMode');
            sessionStorage.removeItem('guestUserId');
            window.location.href = '/login.html';
            return;
        }
        
        // Regular user logout
        try {
            await signOutUser();
            window.location.href = '/login.html';
        } catch (error) {
            console.error('Error signing out:', error);
            alert('Error signing out. Please try again.');
        }
    });
}


