/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {Observable, Subject} from 'rxjs';
import {
  CheckResult,
  CheckRun,
  ChecksApiConfig,
  ChecksProvider,
} from '../../api/checks';
import {Model} from '../model';
import {select} from '../../utils/observable-util';

export interface ChecksPlugin {
  pluginName: string;
  provider: ChecksProvider;
  config: ChecksApiConfig;
}

export interface ChecksUpdate {
  pluginName: string;
  run: CheckRun;
  result: CheckResult;
}

/** Application wide state of plugins. */
interface PluginsState {
  /**
   * List of plugins that have called checks().register().
   */
  checksPlugins: ChecksPlugin[];
}

export class PluginsModel extends Model<PluginsState> {
  /** Private version of the event bus below. */
  private checksAnnounceSubject$ = new Subject<ChecksPlugin>();

  /** Event bus for telling the checks models that announce() was called. */
  public checksAnnounce$: Observable<ChecksPlugin> =
    this.checksAnnounceSubject$.asObservable();

  /** Private version of the event bus below. */
  private checksUpdateSubject$ = new Subject<ChecksUpdate>();

  /** Event bus for telling the checks models that updateResult() was called. */
  public checksUpdate$: Observable<ChecksUpdate> =
    this.checksUpdateSubject$.asObservable();

  public checksPlugins$ = select(this.state$, state => state.checksPlugins);

  constructor() {
    super({
      checksPlugins: [],
    });
  }

  checksRegister(plugin: ChecksPlugin) {
    const nextState = {...this.getState()};
    nextState.checksPlugins = [...nextState.checksPlugins];
    const alreadysRegistered = nextState.checksPlugins.some(
      p => p.pluginName === plugin.pluginName
    );
    if (alreadysRegistered) {
      console.warn(
        `${plugin.pluginName} tried to register twice as a checks provider. Ignored.`
      );
      return;
    }
    nextState.checksPlugins.push(plugin);
    this.setState(nextState);
  }

  checksUpdate(update: ChecksUpdate) {
    const plugins = this.getState().checksPlugins;
    const plugin = plugins.find(p => p.pluginName === update.pluginName);
    if (!plugin) {
      console.warn(
        `Plugin '${update.pluginName}' not found. checksUpdate() ignored.`
      );
      return;
    }
    this.checksUpdateSubject$.next(update);
  }

  checksAnnounce(pluginName: string) {
    const plugins = this.getState().checksPlugins;
    const plugin = plugins.find(p => p.pluginName === pluginName);
    if (!plugin) {
      console.warn(
        `Plugin '${pluginName}' not found. checksAnnounce() ignored.`
      );
      return;
    }
    this.checksAnnounceSubject$.next(plugin);
  }
}
