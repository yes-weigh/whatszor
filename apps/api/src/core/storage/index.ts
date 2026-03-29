import { IStorageProvider } from './IStorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import { S3StorageProvider } from './S3StorageProvider';
import { env } from '../../env';
import { createLogger } from '../logger';

let _providerInstance: IStorageProvider | null = null;

export function getStorageProvider(): IStorageProvider {
    if (!_providerInstance) {
        if (env.STORAGE_PROVIDER === 's3') {
            _providerInstance = new S3StorageProvider();
            createLogger({ module: 'storage' }).info('Initialized S3StorageProvider');
        } else {
            _providerInstance = new LocalStorageProvider();
            createLogger({ module: 'storage' }).info('Initialized LocalStorageProvider');
        }
    }
    
    return _providerInstance;
}
