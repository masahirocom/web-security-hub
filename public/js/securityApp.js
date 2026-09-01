'use strict';
import { wireZapConnection } from './security/zapConnection.js';
import { wireDynamicScan } from './security/dynamicScan.js';
import { wireStaticScan } from './security/staticScan.js';
wireZapConnection(); wireDynamicScan(); wireStaticScan();
