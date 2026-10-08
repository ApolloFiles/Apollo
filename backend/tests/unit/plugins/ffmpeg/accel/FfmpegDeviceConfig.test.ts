import type AppConfiguration from '#src/config/AppConfiguration.js';
import FfmpegDeviceConfig from '#src/plugins/official/ffmpeg/accel/FfmpegDeviceConfig.js';

function createConfig(devices: string): FfmpegDeviceConfig {
  return new FfmpegDeviceConfig({ config: { ffmpeg: { devices } } } as unknown as AppConfiguration);
}

describe(FfmpegDeviceConfig, () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  test.for([
    { value: 'auto' },
    { value: ' AUTO ' },
    { value: '' },
  ])("Uses every device for '$value'", ({ value }) => {
    expect(createConfig(value).getSelection()).toEqual({ mode: 'auto' });
  });

  test("Uses no device for 'off'", () => {
    expect(createConfig('off').getSelection()).toEqual({ mode: 'off' });
  });

  test('Keeps an allowlist in the order it was written', () => {
    expect(createConfig(' vaapi:/dev/dri/renderD129 ,cuda:0').getSelection()).toEqual({
      mode: 'allowlist',
      deviceIds: ['vaapi:/dev/dri/renderD129', 'cuda:0'],
    });
  });

  test('Drops ids it cannot parse, and says so', () => {
    const selection = createConfig('nvidia,cuda:0').getSelection();

    expect(selection).toEqual({ mode: 'allowlist', deviceIds: ['cuda:0'] });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("'nvidia'"));
  });

  test('Falls back to every device when nothing in the list is usable, and says so', () => {
    const selection = createConfig('nvidia').getSelection();

    expect(selection).toEqual({ mode: 'auto' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("APOLLO_FFMPEG_DEVICES='nvidia'"));
  });
});
