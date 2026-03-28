import { describe, it, expect } from './runner.js';
import { createGarment, isValidCategory } from '../src/models/garment.js';
import { createUser } from '../src/models/user.js';
import { rootReducer } from '../src/state/reducers.js';
import { createInitialState } from '../src/state/app-state.js';
import {
  setUser, completeOnboarding, addWardrobeItem, removeWardrobeItem,
  setWardrobeItems, setAvatarUrl,
} from '../src/state/actions.js';

describe('Wardrobe Management — State Actions', () => {
  it('SET_USER should set the user in state', () => {
    const state = createInitialState();
    const user = createUser({ name: 'Anna', style: 'casual' });
    const next = rootReducer(state, setUser(user));
    expect(next.user?.name).toBe('Anna');
    expect(next.user?.style).toBe('casual');
  });

  it('COMPLETE_ONBOARDING should mark onboarding as complete', () => {
    const state = createInitialState();
    const next = rootReducer(state, completeOnboarding());
    expect(next.onboardingComplete).toBeTruthy();
  });

  it('SET_AVATAR_URL should update user avatar', () => {
    let state = createInitialState();
    const user = createUser({ name: 'Anna', style: 'casual' });
    state = rootReducer(state, setUser(user));
    const next = rootReducer(state, setAvatarUrl('data:image/svg+xml,avatar'));
    expect(next.user?.avatarUrl).toBe('data:image/svg+xml,avatar');
  });

  it('ADD_WARDROBE_ITEM should add a garment to wardrobeItems', () => {
    const state = createInitialState();
    const garment = createGarment({
      name: 'Red Shirt', category: 'shirt', imageUrl: '',
      position: { x: 15, y: 8, width: 45, height: 28 }, color: '#FF0000',
    });
    const next = rootReducer(state, addWardrobeItem(garment));
    expect(next.wardrobeItems).toHaveLength(1);
    expect(next.wardrobeItems[0].name).toBe('Red Shirt');
  });

  it('ADD_WARDROBE_ITEM should append, not replace', () => {
    let state = createInitialState();
    const g1 = createGarment({ id: 'g1', name: 'Shirt A', category: 'shirt', imageUrl: '', position: { x: 0, y: 0, width: 10, height: 10 }, color: '#AAA' });
    const g2 = createGarment({ id: 'g2', name: 'Pants B', category: 'pants', imageUrl: '', position: { x: 0, y: 0, width: 10, height: 10 }, color: '#BBB' });
    state = rootReducer(state, addWardrobeItem(g1));
    state = rootReducer(state, addWardrobeItem(g2));
    expect(state.wardrobeItems).toHaveLength(2);
  });

  it('REMOVE_WARDROBE_ITEM should remove a garment by id', () => {
    let state = createInitialState();
    const g1 = createGarment({ id: 'g1', name: 'Shirt', category: 'shirt', imageUrl: '', position: { x: 0, y: 0, width: 10, height: 10 }, color: '#AAA' });
    state = rootReducer(state, addWardrobeItem(g1));
    expect(state.wardrobeItems).toHaveLength(1);
    state = rootReducer(state, removeWardrobeItem('g1'));
    expect(state.wardrobeItems).toHaveLength(0);
  });

  it('REMOVE_WARDROBE_ITEM should not crash if id not found', () => {
    const state = createInitialState();
    const next = rootReducer(state, removeWardrobeItem('nonexistent'));
    expect(next.wardrobeItems).toHaveLength(0);
  });

  it('SET_WARDROBE_ITEMS should replace entire wardrobe list', () => {
    const state = createInitialState();
    const items = [
      createGarment({ id: 'a', name: 'A', category: 'shirt', imageUrl: '', position: { x: 0, y: 0, width: 10, height: 10 }, color: '#111' }),
      createGarment({ id: 'b', name: 'B', category: 'pants', imageUrl: '', position: { x: 0, y: 0, width: 10, height: 10 }, color: '#222' }),
    ];
    const next = rootReducer(state, setWardrobeItems(items));
    expect(next.wardrobeItems).toHaveLength(2);
  });
});

describe('Wardrobe Management — Edge Cases', () => {
  it('should prevent adding a garment with invalid category', () => {
    expect(() => createGarment({
      name: 'Bad Item', category: /** @type {any} */ ('hat'), imageUrl: '',
      position: { x: 0, y: 0, width: 10, height: 10 },
    })).toThrow();
  });

  it('should handle adding garment with no color gracefully', () => {
    const g = createGarment({
      name: 'Neutral Shirt', category: 'shirt', imageUrl: '',
      position: { x: 15, y: 8, width: 45, height: 28 },
    });
    expect(g.color).toBe(undefined);
  });

  it('should validate all known categories', () => {
    const categories = ['base', 'shirt', 'sweater', 'outerwear', 'dress', 'accessory', 'pants', 'socks', 'shoes'];
    for (const cat of categories) {
      expect(isValidCategory(cat)).toBeTruthy();
    }
    expect(isValidCategory('hat')).toBeFalsy();
    expect(isValidCategory('gloves')).toBeFalsy();
  });

  it('should preserve state immutability after wardrobe operations', () => {
    const state = createInitialState();
    const g = createGarment({ id: 'x', name: 'X', category: 'shirt', imageUrl: '', position: { x: 0, y: 0, width: 10, height: 10 }, color: '#000' });
    const next = rootReducer(state, addWardrobeItem(g));
    // Original state should remain unchanged
    expect(state.wardrobeItems).toHaveLength(0);
    expect(next.wardrobeItems).toHaveLength(1);
  });

  it('should replace existing wardrobe items with the same id instead of duplicating them', () => {
    let state = createInitialState();
    const first = createGarment({ id: 'dup-1', name: 'First Shirt', category: 'shirt', imageUrl: '', position: { x: 0, y: 0, width: 10, height: 10 }, color: '#111' });
    const second = createGarment({ id: 'dup-1', name: 'Updated Shirt', category: 'shirt', imageUrl: '', position: { x: 0, y: 0, width: 10, height: 10 }, color: '#222' });
    state = rootReducer(state, addWardrobeItem(first));
    state = rootReducer(state, addWardrobeItem(second));
    expect(state.wardrobeItems).toHaveLength(1);
    expect(state.wardrobeItems[0].name).toBe('Updated Shirt');
  });

  it('should handle rapid add/remove operations', () => {
    let state = createInitialState();
    for (let i = 0; i < 10; i++) {
      const g = createGarment({ id: `g${i}`, name: `Item ${i}`, category: 'accessory', imageUrl: '', position: { x: 0, y: 0, width: 10, height: 10 }, color: '#CCC' });
      state = rootReducer(state, addWardrobeItem(g));
    }
    expect(state.wardrobeItems).toHaveLength(10);

    for (let i = 0; i < 5; i++) {
      state = rootReducer(state, removeWardrobeItem(`g${i}`));
    }
    expect(state.wardrobeItems).toHaveLength(5);
  });
});
