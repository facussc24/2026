import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { regenerateNodeIds } from '../../public/main.js';

describe('regenerateNodeIds race condition', () => {
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

    test('should produce unique IDs even when called in rapid succession', () => {
        // --- ARRANGE ---
        const tree1 = [{ id: 'a', children: [{ id: 'b' }] }];
        const tree2 = [{ id: 'c', children: [{ id: 'd' }] }];
        const tree3 = [{ id: 'e', children: [{ id: 'f' }] }];

        // --- ACT ---
        // Call the function multiple times without any delay.
        // This increases the chance of Date.now() returning the same value.
        regenerateNodeIds(tree1);
        regenerateNodeIds(tree2);
        regenerateNodeIds(tree3);

        // --- ASSERT ---
        const ids1 = getIds(tree1);
        const ids2 = getIds(tree2);
        const ids3 = getIds(tree3);

        const allIds = [...ids1, ...ids2, ...ids3];
        const uniqueIds = new Set(allIds);

        // If there are collisions, the size of the Set will be smaller than the total number of IDs.
        expect(uniqueIds.size).toBe(allIds.length);
        expect(allIds.length).toBe(6);
    });
});
