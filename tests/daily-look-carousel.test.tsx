import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { DailyLookGarmentCarousel } from '../src/native/components/daily-look/DailyLookGarmentCarousel';
import { defaultTheme } from '../src/native/theme';
import { buildWardrobeItem } from '../src/shared/wardrobe';

describe('DailyLookGarmentCarousel', () => {
  it('renders the used wardrobe cards returned by the daily look job', () => {
    const items = [
      buildWardrobeItem({
        id: 'garment-1',
        name: 'white shirt',
        category: 'shirt',
        color: 'white',
        imageUrl: 'https://example.com/shirt.webp',
      }),
      buildWardrobeItem({
        id: 'garment-2',
        name: 'blue jeans',
        category: 'pants',
        color: 'blue',
        imageUrl: 'https://example.com/jeans.webp',
      }),
    ];

    render(<DailyLookGarmentCarousel items={items} theme={defaultTheme} />);

    expect(screen.getByTestId('daily-look-garment-carousel')).toBeTruthy();
    expect(screen.getAllByText('White Shirt')).toHaveLength(2);
    expect(screen.getAllByText('Blue Jeans')).toHaveLength(2);
    expect(screen.getByTestId('wardrobe-garment-garment-1')).toBeTruthy();
    expect(screen.getByTestId('wardrobe-garment-garment-2')).toBeTruthy();
  });
});
