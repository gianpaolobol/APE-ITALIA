import { Controller, Get, Header } from '@nestjs/common';
import { PRIVACY_MD, TERMS_MD, renderLegal } from './texts';

/** Public legal pages linked from the app and the store listings. */
@Controller()
export class LegalController {
 @Get('privacy')
 @Header('Content-Type', 'text/html; charset=utf-8')
 privacy() { return renderLegal(PRIVACY_MD); }

 @Get('termini')
 @Header('Content-Type', 'text/html; charset=utf-8')
 terms() { return renderLegal(TERMS_MD); }
}
