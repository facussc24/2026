/**
 * @jest-environment jsdom
 */

describe('ECO Form Local Storage Logic', () => {

  // This helper function simulates the behavior of saving form data.
  // It takes the form element and the selector for checkboxes as arguments.
  const getFormDataFromDOM = (form, checkboxSelector) => {
    const formData = new FormData(form);
    const data = {};

    // Process standard form fields
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    // Process checkboxes using the provided selector
    form.querySelectorAll(checkboxSelector).forEach(cb => {
      data[cb.name] = cb.checked;
    });

    return data;
  };

  // Test case to demonstrate the original, buggy behavior.
  test('Buggy version should save the state of a disabled checkbox', () => {
    // 1. Setup: Create a mock DOM representing the relevant part of the form.
    document.body.innerHTML = `
      <form id="eco-form">
        <input type="text" name="other_field" value="some_value">
        <input type="checkbox" name="user_editable_checkbox" checked>
        <input type="checkbox" name="derived_state_checkbox" checked disabled>
      </form>
    `;
    const form = document.getElementById('eco-form');

    // 2. Action: Call the data gathering function with the buggy selector.
    const buggySelector = 'input[type="checkbox"]';
    const formData = getFormDataFromDOM(form, buggySelector);

    // 3. Assertion: Verify that the disabled checkbox's state was saved.
    // This is the bug: a derived, read-only field's state is being persisted.
    expect(formData).toHaveProperty('derived_state_checkbox');
    expect(formData.derived_state_checkbox).toBe(true);
    expect(formData).toHaveProperty('user_editable_checkbox');
    expect(formData.user_editable_checkbox).toBe(true);
  });

  // Test case to verify the fix.
  test('Fixed version should NOT save the state of a disabled checkbox', () => {
    // 1. Setup: Use the same mock DOM as the buggy version test.
    document.body.innerHTML = `
      <form id="eco-form">
        <input type="text" name="other_field" value="some_value">
        <input type="checkbox" name="user_editable_checkbox" checked>
        <input type="checkbox" name="derived_state_checkbox" checked disabled>
      </form>
    `;
    const form = document.getElementById('eco-form');

    // 2. Action: Call the data gathering function with the corrected selector.
    const fixedSelector = 'input[type="checkbox"]:not(:disabled)';
    const formData = getFormDataFromDOM(form, fixedSelector);

    // 3. Assertion: Verify that the disabled checkbox's state was ignored.
    // The regular, user-editable checkbox should still be saved correctly.
    expect(formData).not.toHaveProperty('derived_state_checkbox');
    expect(formData).toHaveProperty('user_editable_checkbox');
    expect(formData.user_editable_checkbox).toBe(true);
  });

});
