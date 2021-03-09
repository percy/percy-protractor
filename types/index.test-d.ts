import percySnapshot from '.';
import { expectType, expectError } from 'tsd';
import { ProtractorBrowser } from 'protractor';

declare const browser: ProtractorBrowser;

expectError(percySnapshot());
expectError(percySnapshot(browser));

expectType<Promise<void>>(percySnapshot('Snapshot name'));
expectType<Promise<void>>(percySnapshot(browser, 'Snapshot name'));
expectType<Promise<void>>(percySnapshot('Snapshot name', { widths: [1000] }));
expectType<Promise<void>>(percySnapshot(browser, 'Snapshot name', { widths: [1000] }));

expectError(percySnapshot('Snapshot name', { foo: 'bar' }));
expectError(percySnapshot(browser, 'Snapshot name', { foo: 'bar' }));
