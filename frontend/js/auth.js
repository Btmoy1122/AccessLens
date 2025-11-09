/**
 * Authentication Page Logic
 * Handles login and account creation
 */

import { signInWithGoogle, signInWithEmail, createAccountWithEmail, onAuthStateChange } from '@backend/services/auth-service.js';
import { createUser } from '@backend/services/user-service.js';

// DOM Elements
const googleSignInBtn = document.getElementById('google-signin-btn');
const emailAuthForm = document.getElementById('email-auth-form');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const createAccountBtn = document.getElementById('create-account-btn');
const guestBtn = document.getElementById('guest-btn');
const authError = document.getElementById('auth-error');
const authLoading = document.getElementById('auth-loading');

let isCreatingAccount = false;

// Ensure inputs are not disabled and can receive focus
if (emailInput) {
    emailInput.disabled = false;
    emailInput.readOnly = false;
    emailInput.style.pointerEvents = 'auto';
}

if (passwordInput) {
    passwordInput.disabled = false;
    passwordInput.readOnly = false;
    passwordInput.style.pointerEvents = 'auto';
    // Ensure password input can be focused
    passwordInput.addEventListener('focus', () => {
        console.log('Password input focused');
    });
    passwordInput.addEventListener('input', () => {
        console.log('Password input changed');
    });
}

// Guest mode - continue without authentication
if (guestBtn) {
    guestBtn.addEventListener('click', () => {
        // Set guest mode in sessionStorage
        sessionStorage.setItem('guestMode', 'true');
        sessionStorage.setItem('guestUserId', 'guest_' + Date.now());
        
        // Redirect to dashboard (same as signed-in users)
        window.location.href = '/dashboard.html';
    });
}

// Check if user is already logged in
onAuthStateChange((user) => {
    if (user) {
        // User is logged in, redirect to dashboard
        window.location.href = '/dashboard.html';
    }
});

// Google Sign In
if (googleSignInBtn) {
    googleSignInBtn.addEventListener('click', async () => {
        try {
            showLoading(true);
            hideError();
            
            const user = await signInWithGoogle();
            console.log('Signed in with Google:', user);
            
            // Create user profile if doesn't exist
            await createUser(user.uid);
            
            // Redirect to dashboard
            window.location.href = '/dashboard.html';
        } catch (error) {
            console.error('Google sign in error:', error);
            showError(error.message || 'Failed to sign in with Google');
        } finally {
            showLoading(false);
        }
    });
}

// Email/Password Sign In
if (emailAuthForm) {
    emailAuthForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        if (!email || !password) {
            showError('Please enter email and password');
            return;
        }
        
        try {
            showLoading(true);
            hideError();
            
            if (isCreatingAccount) {
                // Create account
                const user = await createAccountWithEmail(email, password);
                console.log('Account created:', user);
                
                // Create user profile
                await createUser(user.uid);
                
                // Redirect to dashboard
                window.location.href = '/dashboard.html';
            } else {
                // Sign in
                const user = await signInWithEmail(email, password);
                console.log('Signed in:', user);
                
                // Redirect to dashboard
                window.location.href = '/dashboard.html';
            }
        } catch (error) {
            console.error('Auth error:', error);
            showError(error.message || 'Failed to sign in. Please check your credentials.');
        } finally {
            showLoading(false);
        }
    });
}

// Toggle between sign in and create account
if (createAccountBtn) {
    createAccountBtn.addEventListener('click', () => {
        isCreatingAccount = !isCreatingAccount;
        const submitBtn = emailAuthForm.querySelector('button[type="submit"]');
        
        if (isCreatingAccount) {
            submitBtn.textContent = 'Create Account';
            createAccountBtn.textContent = 'Sign In Instead';
        } else {
            submitBtn.textContent = 'Sign In';
            createAccountBtn.textContent = 'Create Account';
        }
    });
}

function showLoading(show) {
    if (authLoading) {
        authLoading.style.display = show ? 'block' : 'none';
    }
    if (googleSignInBtn) googleSignInBtn.disabled = show;
    if (emailAuthForm) {
        const submitBtn = emailAuthForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = show;
    }
}

function showError(message) {
    if (authError) {
        authError.textContent = message;
        authError.style.display = 'block';
    }
}

function hideError() {
    if (authError) {
        authError.style.display = 'none';
    }
}

