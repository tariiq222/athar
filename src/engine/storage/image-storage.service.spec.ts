import { ImageStorageService } from './image-storage.service';

const putObject = jest.fn();
jest.mock('minio', () => ({
  Client: jest
    .fn()
    .mockImplementation(() => ({ putObject: (...a: unknown[]) => putObject(...a) })),
}));

const config = {
  get: (k: string) =>
    ({
      MINIO_ENDPOINT: 'localhost',
      MINIO_PORT: '9000',
      MINIO_ACCESS_KEY: 'a',
      MINIO_SECRET_KEY: 's',
      MINIO_BUCKET: 'athar-images',
    }[k]),
} as any;

describe('ImageStorageService', () => {
  beforeEach(() => putObject.mockReset());

  it('uploads bytes and returns the object url', async () => {
    putObject.mockResolvedValue({});
    const svc = new ImageStorageService(config);
    const url = await svc.upload(Buffer.from('x'), 'posts/1.png');
    expect(putObject).toHaveBeenCalledWith(
      'athar-images',
      'posts/1.png',
      expect.any(Buffer),
      expect.any(Number),
      { 'Content-Type': 'image/png' },
    );
    expect(url).toContain('athar-images/posts/1.png');
  });
});