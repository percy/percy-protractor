import { expectType, expectError } from 'tsd';
import percySnapshot from '.';

expectError(percySnapshot());

expectType<void>(await percySnapshot('Snapshot name'));
expectType<void>(await percySnapshot('Snapshot name', { widths: [1000] }));

expectError(percySnapshot('Snapshot name', { foo: 'bar' }));
