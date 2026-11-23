import { BadRequestException, Body, Controller, HttpCode, Inject, Optional, Post, ServiceUnavailableException, UnprocessableEntityException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { sniffMimeType, stripJpegMetadata } from '../evidence/file-policy';
import { PHOTO_READER, READ_KINDS, type PhotoReader, type ReadKind } from './photo-reader';

const MAX_BYTES = 8 * 1024 * 1024;

/** Public helper for the guided survey: photo in, structured nameplate data out. Nothing is stored. */
@Controller('v1/survey')
export class SurveyController {
 constructor(@Optional() @Inject(PHOTO_READER) private readonly reader: PhotoReader | null = null) {}

 @Post('read-photo')
 @HttpCode(200)
 @Throttle({ default: { limit: 10, ttl: 60_000 } })
 @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1, fields: 2, parts: 3 } }))
 async read(@Body('kind') kind: unknown, @UploadedFile() file?: { buffer: Buffer }) {
  if (!this.reader) throw new ServiceUnavailableException('Photo reader not enabled');
  if (typeof kind !== 'string' || !(READ_KINDS as readonly string[]).includes(kind)) throw new BadRequestException('Unknown kind');
  if (!file?.buffer?.length) throw new BadRequestException('file required');
  const mime = sniffMimeType(file.buffer);
  if (mime !== 'image/jpeg' && mime !== 'image/png') throw new UnprocessableEntityException('Only JPEG or PNG images');
  const data = mime === 'image/jpeg' ? stripJpegMetadata(file.buffer) ?? file.buffer : file.buffer;
  try {
   const r = await this.reader.read(kind as ReadKind, mime, data);
   return { modelId: this.reader.modelId, fields: r.fields, summary: r.summary };
  } catch {
   throw new ServiceUnavailableException('Photo reader temporarily unavailable');
  }
 }
}
