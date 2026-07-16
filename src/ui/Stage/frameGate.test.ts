import { shouldDrawFrame } from './frameGate';

describe('shouldDrawFrame', () => {
  it('always draws while not paused, regardless of the token', () => {
    expect(shouldDrawFrame(false, 0, 0)).toBe(true);
    expect(shouldDrawFrame(false, 7, 3)).toBe(true);
  });

  it('skips the frame while paused and the token is unchanged (frozen picture, §7.5)', () => {
    expect(shouldDrawFrame(true, 3, 3)).toBe(false);
  });

  it('F2: draws once when the token changes while paused (Clear during Pause)', () => {
    expect(shouldDrawFrame(true, 4, 3)).toBe(true);
  });
});
