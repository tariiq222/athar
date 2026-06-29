import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

/**
 * Puts an image object into MinIO/S3-compatible storage and returns its
 * public URL. The bucket is created in the foundation docker-compose; this
 * service only writes objects.
 */
@Injectable()
export class ImageStorageService {
  private readonly client: Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly port: number;

  constructor(config: ConfigService) {
    this.endpoint = config.get<string>('MINIO_ENDPOINT')!;
    this.port = Number(config.get<string>('MINIO_PORT'));
    this.bucket = config.get<string>('MINIO_BUCKET')!;
    this.client = new Client({
      endPoint: this.endpoint,
      port: this.port,
      useSSL: false,
      accessKey: config.get<string>('MINIO_ACCESS_KEY')!,
      secretKey: config.get<string>('MINIO_SECRET_KEY')!,
    });
  }

  async upload(bytes: Buffer, key: string): Promise<string> {
    await this.client.putObject(this.bucket, key, bytes, bytes.length, {
      'Content-Type': 'image/png',
    });
    return `http://${this.endpoint}:${this.port}/${this.bucket}/${key}`;
  }
}