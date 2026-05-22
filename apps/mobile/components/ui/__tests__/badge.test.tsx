import { render } from '@testing-library/react-native';

import { Badge } from '../badge';

describe('Badge', () => {
  it('renders capped numeric counts', () => {
    const { getByText } = render(<Badge count={120} />);

    expect(getByText('99+')).toBeTruthy();
  });

  it('renders labels and hides when there is no positive count or text', () => {
    const labeled = render(<Badge label="N" />);
    expect(labeled.getByText('N')).toBeTruthy();
    labeled.unmount();

    const empty = render(<Badge />);
    expect(empty.toJSON()).toBeNull();

    const zero = render(<Badge count={0} />);
    expect(zero.toJSON()).toBeNull();
  });
});
