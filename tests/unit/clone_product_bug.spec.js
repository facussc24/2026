import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { regenerateNodeIds } from '../../public/main.js';

describe('regenerateNodeIds Function', () => {

    const getIds = (nodes) => {
        let ids = [];
        if (!nodes) return ids;
        nodes.forEach(node => {
            ids.push(node.id);
            if (node.children) {
                ids = ids.concat(getIds(node.children));
            }
        });
        return ids;
    };

    test('[FIX] should generate unique IDs for all nodes in a tree structure', () => {
        // --- ARRANGE ---
        // Create a deep copy of a sample node tree for the function to mutate
        const mockNodeTree = [
            { id: 'old-1', children: [
                { id: 'old-2', children: [] },
                { id: 'old-3', children: [] }
            ]},
            { id: 'old-4', children: [] }
        ];

        // --- ACT ---
        // Call the function, which will modify the mockNodeTree in place
        regenerateNodeIds(mockNodeTree);

        // --- ASSERT ---
        // 1. Get all the new IDs from the mutated tree
        const allGeneratedIds = getIds(mockNodeTree);
        const totalIds = allGeneratedIds.length;

        // 2. Check for uniqueness
        const uniqueIds = new Set(allGeneratedIds);

        // 3. The number of unique IDs must equal the total number of nodes
        expect(uniqueIds.size).toBe(totalIds);
        expect(totalIds).toBe(4); // Ensure we processed the whole tree

        // 4. Check that old IDs are gone
        expect(uniqueIds.has('old-1')).toBe(false);
    });

    test('should handle empty or null input without crashing', () => {
        expect(() => regenerateNodeIds(null)).not.toThrow();
        expect(() => regenerateNodeIds(undefined)).not.toThrow();
        expect(() => regenerateNodeIds([])).not.toThrow();
    });

    test('should generate different IDs on subsequent calls', () => {
        const tree1 = [{ id: 'a' }];
        const tree2 = [{ id: 'b' }];

        regenerateNodeIds(tree1);
        // A small delay to ensure Date.now() will be different
        setTimeout(() => {
            regenerateNodeIds(tree2);
            expect(tree1[0].id).not.toEqual(tree2[0].id);
        }, 10);
    });
});
