# Deprecation of Direct jsPDF Implementation

## Summary

This document outlines the decision to deprecate the direct, manual use of `jsPDF` and its plugins (like `jsPDF-AutoTable`) in favor of the higher-level `html2pdf.js` library for client-side PDF generation.

## Problem

The previous implementation, which involved constructing PDFs manually using `jsPDF`, suffered from several critical issues:

1.  **Script Loading Race Conditions**: The application repeatedly failed due to a race condition where `jsPDF`'s plugins and font files would attempt to execute before the main `jsPDF` library was fully loaded and initialized. This resulted in persistent `ReferenceError: jsPDF is not defined` errors.
2.  **Environmental Inconsistency**: Multiple attempts to resolve the loading order using standard methods (`defer`, `onload`, synchronous blocking) failed in the production/testing environment, suggesting a deep-seated or inconsistent behavior in how the browser was handling the script pipeline. This made the implementation fragile and difficult to maintain.
3.  **Complexity**: Manually creating tables and laying out content with `jsPDF-AutoTable` required complex configuration code that was difficult to debug and extend.

## Solution

To resolve these issues definitively, the decision was made to switch to **`html2pdf.js`**.

`html2pdf.js` acts as a wrapper around `jsPDF` and `html2canvas`. It simplifies the development process by abstracting away the complexities of PDF creation.

### Key Advantages of the New Approach:

1.  **Robustness**: `html2pdf.js` is distributed as a single bundle (`html2pdf.bundle.min.js`) that contains all of its necessary dependencies. This completely eliminates the script-loading and dependency-management issues that plagued the previous implementation.
2.  **Simplicity**: The API is significantly simpler. Instead of manually building tables and drawing elements, we can now convert an existing HTML element directly into a PDF with a single function call (e.g., `html2pdf(element).save()`).
3.  **Maintainability**: The new implementation is easier to read, understand, and maintain. Future changes to the PDF's appearance can be made by modifying the source HTML and CSS, rather than complex JavaScript PDF generation code.

## Implementation

The `exportSinopticoTabularToPdf` function in `main.js` was refactored to use `html2pdf.js`. All related `jsPDF` script tags were removed from `index.html` and replaced with a single CDN link for the `html2pdf.js` bundle.
