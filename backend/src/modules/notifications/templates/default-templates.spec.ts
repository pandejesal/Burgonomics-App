import { renderTemplate } from '../templates/default-templates';

describe('renderTemplate', () => {
  it('substitutes {{key}} placeholders', () => {
    expect(renderTemplate('Order #{{orderNo}} placed', { orderNo: 'A12' })).toBe(
      'Order #A12 placed',
    );
  });

  it('leaves missing keys empty', () => {
    expect(renderTemplate('Hi {{name}}!', {})).toBe('Hi !');
  });

  it('handles nested-looking keys as flat lookups', () => {
    expect(renderTemplate('{{ amount }}', { amount: 200 })).toBe('200');
  });
});
