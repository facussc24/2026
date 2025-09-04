import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Import the function directly from its new, testable location in utils.js
import { validateField } from '../../public/utils.js';

describe('validateField', () => {
    let inputElement;
    let errorElement;

    beforeEach(() => {
        // Set up a clean DOM for each test, simulating the elements the function needs
        document.body.innerHTML = `
            <div>
                <input id="test-input" name="test-input">
                <p id="error-test-input"></p>
            </div>
        `;
        inputElement = document.getElementById('test-input');
        errorElement = document.getElementById('error-test-input');
    });

    test('should return true for a valid required text field with value', () => {
        const fieldConfig = { key: 'test-input', required: true, type: 'text' };
        inputElement.value = 'Some text';
        const isValid = validateField(fieldConfig, inputElement);
        expect(isValid).toBe(true);
        expect(inputElement.classList.contains('border-red-500')).toBe(false);
        expect(errorElement.textContent).toBe('');
    });

    test('should return false for a required text field with no value', () => {
        const fieldConfig = { key: 'test-input', required: true, type: 'text' };
        inputElement.value = '';
        const isValid = validateField(fieldConfig, inputElement);
        expect(isValid).toBe(false);
        expect(inputElement.classList.contains('border-red-500')).toBe(true);
        expect(errorElement.textContent).toBe('Este campo es obligatorio.');
    });

    test('should return true for a valid number field', () => {
        const fieldConfig = { key: 'test-input', required: true, type: 'number' };
        inputElement.value = '123.45';
        const isValid = validateField(fieldConfig, inputElement);
        expect(isValid).toBe(true);
        expect(inputElement.classList.contains('border-red-500')).toBe(false);
        expect(errorElement.textContent).toBe('');
    });

    test('[BUG-VERIFY] should return false for a number field with non-numeric text', () => {
        const fieldConfig = { key: 'test-input', required: true, type: 'number' };
        inputElement.value = 'abc';
        const isValid = validateField(fieldConfig, inputElement);
        expect(isValid).toBe(false);
        expect(inputElement.classList.contains('border-red-500')).toBe(true);
        expect(errorElement.textContent).toBe('Debe ingresar un valor numérico.');
    });

    test('[BUG-VERIFY] should return false for a number field with mixed text', () => {
        const fieldConfig = { key: 'test-input', required: true, type: 'number' };
        inputElement.value = '123a';
        const isValid = validateField(fieldConfig, inputElement);
        expect(isValid).toBe(false);
        expect(inputElement.classList.contains('border-red-500')).toBe(true);
        expect(errorElement.textContent).toBe('Debe ingresar un valor numérico.');
    });

    test('should return true for a non-required number field that is empty', () => {
        const fieldConfig = { key: 'test-input', required: false, type: 'number' };
        inputElement.value = '';
        const isValid = validateField(fieldConfig, inputElement);
        expect(isValid).toBe(true);
        expect(inputElement.classList.contains('border-red-500')).toBe(false);
        expect(errorElement.textContent).toBe('');
    });

    test('should return false for a required number field that is empty', () => {
        const fieldConfig = { key: 'test-input', required: true, type: 'number' };
        inputElement.value = '';
        const isValid = validateField(fieldConfig, inputElement);
        expect(isValid).toBe(false);
        expect(inputElement.classList.contains('border-red-500')).toBe(true);
        expect(errorElement.textContent).toBe('Este campo es obligatorio.');
    });
});
