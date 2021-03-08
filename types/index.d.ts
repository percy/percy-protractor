import { ProtractorBrowser } from 'protractor';
import { SnapshotOptions } from '@percy/core';

export default function percySnapshot(
  browser: ProtractorBrowser,
  name: string,
  options?: SnapshotOptions
): Promise<void>;

export default function percySnapshot(
  name: string,
  options?: SnapshotOptions
): Promise<void>
