import { IStorageProvider } from './IStorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import { S3StorageProvider } from './S3StorageProvider';
import { env } from '../../env';

let _providerInstance: IStorageProvider | null = null;

export function getStorageProvider(): IStorageProvider {
    if (!_providerInstance) {
        if (env.STORAGE_PROVIDER === 's3') {
            _providerInstance = new S3StorageProvider();
            console.log('Initialized S3StorageProvider');
        } else {
            _providerInstance = new LocalStorageProvider();
            console.log('Initialized LocalStorageProvider');
        }
    }
    
    return _providerInstance;
}
