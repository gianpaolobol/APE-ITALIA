import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '../app.module';
import { collectRoutes, renderApiIndex } from './api-index';

const target = resolve(__dirname, '../../../../docs/API.md');
writeFileSync(target, renderApiIndex(collectRoutes(AppModule)));
console.log('Wrote ' + target);
