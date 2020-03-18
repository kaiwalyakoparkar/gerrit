/**
 * @license
 * Copyright (C) 2015 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import '../../../scripts/bundled-polymer.js';

import '../../../behaviors/fire-behavior/fire-behavior.js';
import '../../shared/gr-account-chip/gr-account-chip.js';
import '../../shared/gr-button/gr-button.js';
import '../../shared/gr-rest-api-interface/gr-rest-api-interface.js';
import '../../../styles/shared-styles.js';
import {dom} from '@polymer/polymer/lib/legacy/polymer.dom.js';
import {GestureEventListeners} from '@polymer/polymer/lib/mixins/gesture-event-listeners.js';
import {LegacyElementMixin} from '@polymer/polymer/lib/legacy/legacy-element-mixin.js';
import {PolymerElement} from '@polymer/polymer/polymer-element.js';
import {htmlTemplate} from './gr-reviewer-list_html.js';

/**
 * @extends Polymer.Element
 */
class GrReviewerList extends GestureEventListeners(
    LegacyElementMixin(PolymerElement)) {
  static get template() { return htmlTemplate; }

  static get is() { return 'gr-reviewer-list'; }
  /**
   * Fired when the "Add reviewer..." button is tapped.
   *
   * @event show-reply-dialog
   */

  static get properties() {
    return {
      change: Object,
      serverConfig: Object,
      disabled: {
        type: Boolean,
        value: false,
        reflectToAttribute: true,
      },
      mutable: {
        type: Boolean,
        value: false,
      },
      reviewersOnly: {
        type: Boolean,
        value: false,
      },
      ccsOnly: {
        type: Boolean,
        value: false,
      },

      _displayedReviewers: {
        type: Array,
        value() { return []; },
      },
      _reviewers: {
        type: Array,
        value() { return []; },
      },
      _showInput: {
        type: Boolean,
        value: false,
      },
      _addLabel: {
        type: String,
        computed: '_computeAddLabel(ccsOnly)',
      },
      _hiddenReviewerCount: {
        type: Number,
        computed: '_computeHiddenCount(_reviewers, _displayedReviewers)',
      },

      // Used for testing.
      _lastAutocompleteRequest: Object,
      _xhrPromise: Object,
    };
  }

  static get observers() {
    return [
      '_reviewersChanged(change.reviewers.*, change.owner, serverConfig)',
    ];
  }

  /**
   * Converts change.permitted_labels to an array of hashes of label keys to
   * numeric scores.
   * Example:
   * [{
   *   'Code-Review': ['-1', ' 0', '+1']
   * }]
   * will be converted to
   * [{
   *   label: 'Code-Review',
   *   scores: [-1, 0, 1]
   * }]
   */
  _permittedLabelsToNumericScores(labels) {
    if (!labels) return [];
    return Object.keys(labels).map(label => {
      return {
        label,
        scores: labels[label].map(v => parseInt(v, 10)),
      };
    });
  }

  /**
   * Returns hash of labels to max permitted score.
   *
   * @param {!Object} change
   * @returns {!Object} labels to max permitted scores hash
   */
  _getMaxPermittedScores(change) {
    return this._permittedLabelsToNumericScores(change.permitted_labels)
        .map(({label, scores}) => {
          return {
            [label]: scores
                .map(v => parseInt(v, 10))
                .reduce((a, b) => Math.max(a, b))};
        })
        .reduce((acc, i) => Object.assign(acc, i), {});
  }

  /**
   * Returns max permitted score for reviewer.
   *
   * @param {!Object} reviewer
   * @param {!Object} change
   * @param {string} label
   * @return {number}
   */
  _getReviewerPermittedScore(reviewer, change, label) {
    // Note (issue 7874): sometimes the "all" list is not included in change
    // detail responses, even when DETAILED_LABELS is included in options.
    if (!change.labels[label].all) { return NaN; }
    const detailed = change.labels[label].all.filter(
        ({_account_id}) => reviewer._account_id === _account_id).pop();
    if (!detailed) {
      return NaN;
    }
    if (detailed.hasOwnProperty('permitted_voting_range')) {
      return detailed.permitted_voting_range.max;
    } else if (detailed.hasOwnProperty('value')) {
      // If preset, user can vote on the label.
      return 0;
    }
    return NaN;
  }

  _computeVoteableText(reviewer, change) {
    if (!change || !change.labels) { return ''; }
    const maxScores = [];
    const maxPermitted = this._getMaxPermittedScores(change);
    for (const label of Object.keys(change.labels)) {
      const maxScore =
            this._getReviewerPermittedScore(reviewer, change, label);
      if (isNaN(maxScore) || maxScore < 0) { continue; }
      if (maxScore > 0 && maxScore === maxPermitted[label]) {
        maxScores.push(`${label}: +${maxScore}`);
      } else {
        maxScores.push(`${label}`);
      }
    }
    return maxScores.join(', ');
  }

  _reviewersChanged(changeRecord, owner, serverConfig) {
    // Polymer 2: check for undefined
    if ([changeRecord, owner, serverConfig].some(arg => arg === undefined)) {
      return;
    }

    let result = [];
    const reviewers = changeRecord.base;
    for (const key in reviewers) {
      if (this.reviewersOnly && key !== 'REVIEWER') {
        continue;
      }
      if (this.ccsOnly && key !== 'CC') {
        continue;
      }
      if (key === 'REVIEWER' || key === 'CC') {
        result = result.concat(reviewers[key]);
      }
    }
    this._reviewers = result
        .filter(reviewer => reviewer._account_id != owner._account_id);

    const isFirstNameConfigured = serverConfig.accounts
        && serverConfig.accounts.default_display_name === 'FIRST_NAME';
    const maxReviewers = isFirstNameConfigured ? 6 : 3;
    // If there is one or two more than the max reviewers, don't show the
    // 'show more' button, because it takes up just as much space.
    if (this._reviewers.length > maxReviewers + 2) {
      this._displayedReviewers = this._reviewers.slice(0, maxReviewers);
    } else {
      this._displayedReviewers = this._reviewers;
    }
  }

  _computeHiddenCount(reviewers, displayedReviewers) {
    // Polymer 2: check for undefined
    if ([reviewers, displayedReviewers].some(arg => arg === undefined)) {
      return undefined;
    }

    return reviewers.length - displayedReviewers.length;
  }

  _computeCanRemoveReviewer(reviewer, mutable) {
    if (!mutable) { return false; }

    let current;
    for (let i = 0; i < this.change.removable_reviewers.length; i++) {
      current = this.change.removable_reviewers[i];
      if (current._account_id === reviewer._account_id ||
          (!reviewer._account_id && current.email === reviewer.email)) {
        return true;
      }
    }
    return false;
  }

  _handleRemove(e) {
    e.preventDefault();
    const target = dom(e).rootTarget;
    if (!target.account) { return; }
    const accountID = target.account._account_id || target.account.email;
    this.disabled = true;
    this._xhrPromise = this._removeReviewer(accountID).then(response => {
      this.disabled = false;
      if (!response.ok) { return response; }

      const reviewers = this.change.reviewers;

      for (const type of ['REVIEWER', 'CC']) {
        reviewers[type] = reviewers[type] || [];
        for (let i = 0; i < reviewers[type].length; i++) {
          if (reviewers[type][i]._account_id == accountID ||
          reviewers[type][i].email == accountID) {
            this.splice('change.reviewers.' + type, i, 1);
            break;
          }
        }
      }
    })
        .catch(err => {
          this.disabled = false;
          throw err;
        });
  }

  _handleAddTap(e) {
    e.preventDefault();
    const value = {};
    if (this.reviewersOnly) {
      value.reviewersOnly = true;
    }
    if (this.ccsOnly) {
      value.ccsOnly = true;
    }
    this.dispatchEvent(new CustomEvent('show-reply-dialog', {
      detail: {value},
      composed: true, bubbles: true,
    }));
  }

  _handleViewAll(e) {
    this._displayedReviewers = this._reviewers;
  }

  _removeReviewer(id) {
    return this.$.restAPI.removeChangeReviewer(this.change._number, id);
  }

  _computeAddLabel(ccsOnly) {
    return ccsOnly ? 'Add CC' : 'Add reviewer';
  }
}

customElements.define(GrReviewerList.is, GrReviewerList);
