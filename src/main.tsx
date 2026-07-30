import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ConfigRepository, LocalAppRepository, SyncQueueRepository } from './persistence';
import { HttpKlubkoClient } from './klubko';
import { FlightSyncService } from './sync';
import './styles.css';

const repository = new LocalAppRepository(localStorage);
const configRepository = new ConfigRepository(localStorage);
const client = new HttpKlubkoClient(configRepository);
const sync = new FlightSyncService(client, new SyncQueueRepository(localStorage));

registerSW({ immediate: true });

render(<App services={{ repository, client, sync }} />, document.getElementById('root')!);
