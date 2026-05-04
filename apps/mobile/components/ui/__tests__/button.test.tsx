import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Button } from '../button';

describe('Button', () => {
  it('renders children and exposes the button role', () => {
    render(
      <Button accessibilityLabel="primary cta">
        <Text>Tap me</Text>
      </Button>,
    );

    const btn = screen.getByLabelText('primary cta');
    expect(btn).toBeTruthy();
    expect(btn.props.accessibilityRole ?? btn.props.role).toBe('button');
  });

  it('invokes onPress when tapped', () => {
    const onPress = jest.fn();
    render(
      <Button onPress={onPress} accessibilityLabel="cta">
        <Text>Submit</Text>
      </Button>,
    );

    fireEvent.press(screen.getByLabelText('cta'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    render(
      <Button onPress={onPress} disabled accessibilityLabel="cta">
        <Text>Submit</Text>
      </Button>,
    );

    fireEvent.press(screen.getByLabelText('cta'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
