import { jest } from '@jest/globals';

export const getAuth = jest.fn();
export const onAuthStateChanged = jest.fn();
export const createUserWithEmailAndPassword = jest.fn();
export const signInWithEmailAndPassword = jest.fn();
export const sendPasswordResetEmail = jest.fn();
export const signOut = jest.fn();
export const updatePassword = jest.fn();
export const reauthenticateWithCredential = jest.fn();
export const EmailAuthProvider = {
    credential: jest.fn()
};
export const deleteUser = jest.fn();
export const sendEmailVerification = jest.fn();
export const updateProfile = jest.fn();
