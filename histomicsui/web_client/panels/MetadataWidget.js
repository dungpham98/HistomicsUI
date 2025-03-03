import $ from 'jquery';
import _ from 'underscore';

import Panel from '@girder/slicer_cli_web/views/Panel';
import {AccessType} from '@girder/core/constants';
import {confirm} from '@girder/core/dialog';
import events from '@girder/core/events';
import {localeSort} from '@girder/core/misc';
import View from '@girder/core/views/View';

import JsonMetadatumEditWidgetTemplate from '@girder/core/templates/widgets/jsonMetadatumEditWidget.pug';
import JsonMetadatumViewTemplate from '@girder/core/templates/widgets/jsonMetadatumView.pug';
import MetadatumEditWidgetTemplate from '@girder/core/templates/widgets/metadatumEditWidget.pug';
import MetadatumViewTemplate from '@girder/core/templates/widgets/metadatumView.pug';

import JSONEditor from 'jsoneditor/dist/jsoneditor.js'; // can't 'jsoneditor'
import 'jsoneditor/dist/jsoneditor.css';

import 'bootstrap/js/dropdown';

import metadataWidgetTemplate from '../templates/panels/metadataWidget.pug';
import '../stylesheets/panels/metadataWidget.styl';

function getMetadataRecord(item, fieldName) {
    if (item[fieldName]) {
        return item[fieldName];
    }
    let meta = item.attributes;
    fieldName.split('.').forEach((part) => {
        if (!meta[part]) {
            meta[part] = {};
        }
        meta = meta[part];
    });
    return meta;
}

var MetadatumWidget = View.extend({
    className: 'g-widget-metadata-row',

    events: {
        'click .g-widget-metadata-edit-button': 'editMetadata'
    },

    initialize: function (settings) {
        if (!_.has(this.parentView.modes, settings.mode)) {
            throw new Error('Unsupported metadatum mode ' + settings.mode + ' detected.');
        }
        this.mode = settings.mode;
        this.key = settings.key;
        this.value = settings.value;
        this.accessLevel = settings.accessLevel;
        this.parentView = settings.parentView;
        this.fieldName = settings.fieldName;
        this.apiPath = settings.apiPath;
        this.noSave = settings.noSave;
        this.onMetadataEdited = settings.onMetadataEdited;
        this.onMetadataAdded = settings.onMetadataAdded;
    },

    _validate: function (from, to, value) {
        var newMode = this.parentView.modes[to];

        if (_.has(newMode, 'validation') &&
                _.has(newMode.validation, 'from') &&
                _.has(newMode.validation.from, from)) {
            var validate = newMode.validation.from[from][0];
            var msg = newMode.validation.from[from][1];

            if (!validate(value)) {
                events.trigger('g:alert', {
                    text: msg,
                    type: 'warning'
                });
                return false;
            }
        }

        return true;
    },

    // @todo too much duplication with editMetadata
    toggleEditor: function (event, newEditorMode, existingEditor, overrides) {
        var fromEditorMode = (existingEditor instanceof JsonMetadatumEditWidget) ? 'json' : 'simple';
        var newValue = (overrides || {}).value || existingEditor.$el.attr('g-value');
        if (!this._validate(fromEditorMode, newEditorMode, newValue)) {
            return;
        }

        var row = existingEditor.$el;
        existingEditor.destroy();
        row.addClass('editing').empty();

        var opts = _.extend({
            el: row,
            item: this.parentView.item,
            key: row.attr('g-key'),
            value: row.attr('g-value'),
            accessLevel: this.accessLevel,
            newDatum: false,
            parentView: this,
            fieldName: this.fieldName,
            apiPath: this.apiPath,
            noSave: this.noSave,
            onMetadataEdited: this.onMetadataEdited,
            onMetadataAdded: this.onMetadataAdded
        }, overrides || {});

        this.parentView.modes[newEditorMode].editor(opts).render();
    },

    editMetadata: function (event) {
        this.$el.addClass('editing');
        this.$el.empty();

        var opts = {
            item: this.parentView.item,
            key: this.$el.attr('g-key'),
            value: this.$el.attr('g-value'),
            accessLevel: this.accessLevel,
            newDatum: false,
            parentView: this,
            fieldName: this.fieldName,
            apiPath: this.apiPath,
            noSave: this.noSave,
            onMetadataEdited: this.onMetadataEdited,
            onMetadataAdded: this.onMetadataAdded
        };

        // If they're trying to open false, null, 6, etc which are not stored as strings
        if (this.mode === 'json') {
            try {
                var jsonValue = JSON.parse(this.$el.attr('g-value'));

                if (jsonValue !== undefined && !_.isObject(jsonValue)) {
                    opts.value = jsonValue;
                }
            } catch (e) {}
        }

        this.parentView.modes[this.mode].editor(opts)
            .render()
            .$el.appendTo(this.$el);
    },

    render: function () {
        this.$el.attr({
            'g-key': this.key,
            'g-value': _.bind(this.parentView.modes[this.mode].displayValue, this)()
        }).empty();

        this.$el.html(this.parentView.modes[this.mode].template({
            key: this.key,
            value: _.bind(this.parentView.modes[this.mode].displayValue, this)(),
            accessLevel: this.accessLevel,
            AccessType
        }));

        return this;
    }
});

var MetadatumEditWidget = View.extend({
    events: {
        'click .g-widget-metadata-cancel-button': 'cancelEdit',
        'click .g-widget-metadata-save-button': 'save',
        'click .g-widget-metadata-delete-button': 'deleteMetadatum',
        'click .g-widget-metadata-toggle-button': function (event) {
            var editorType;
            // @todo modal
            // in the future this event will have the new editorType (assuming a dropdown)
            if (this instanceof JsonMetadatumEditWidget) {
                editorType = 'simple';
            } else {
                editorType = 'json';
            }
            this.parentView.toggleEditor(event, editorType, this, {
                // Save state before toggling editor
                key: this.$el.find('.g-widget-metadata-key-input').val(),
                value: this.getCurrentValue()
            });
            return false;
        }
    },

    initialize: function (settings) {
        this.item = settings.item;
        this.key = settings.key || '';
        this.fieldName = settings.fieldName || 'meta';
        this.value = (settings.value !== undefined) ? settings.value : '';
        this.accessLevel = settings.accessLevel;
        this.newDatum = settings.newDatum;
        this.fieldName = settings.fieldName;
        this.apiPath = settings.apiPath;
        this.noSave = settings.noSave;
        this.onMetadataEdited = settings.onMetadataEdited;
        this.onMetadataAdded = settings.onMetadataAdded;
    },

    editTemplate: MetadatumEditWidgetTemplate,

    getCurrentValue: function () {
        return this.$el.find('.g-widget-metadata-value-input').val();
    },

    deleteMetadatum: function (event) {
        event.stopImmediatePropagation();
        const target = $(event.currentTarget);
        var metadataList = target.parent().parent();
        if (this.noSave) {
            delete getMetadataRecord(this.item, this.fieldName)[this.key];
            metadataList.remove();
            return;
        }
        var params = {
            text: 'Are you sure you want to delete the metadatum <b>' +
                _.escape(this.key) + '</b>?',
            escapedHtml: true,
            yesText: 'Delete',
            confirmCallback: () => {
                this.item.removeMetadata(this.key, () => {
                    metadataList.remove();
                    // trigger the event
                    this.parentView.parentView.trigger('h-metadata-panel-update', {
                    });
                }, null, {
                    field: this.fieldName,
                    path: this.apiPath
                });
            }
        };
        confirm(params);
    },

    cancelEdit: function (event) {
        event.stopImmediatePropagation();
        const target = $(event.currentTarget);
        var curRow = target.parent().parent();
        if (this.newDatum) {
            curRow.remove();
        } else {
            this.parentView.render();
        }
    },

    save: function (event, value) {
        event.stopImmediatePropagation();
        const target = $(event.currentTarget);
        var curRow = target.parent(),
            tempKey = curRow.find('.g-widget-metadata-key-input').val().trim(),
            tempValue = (value !== undefined) ? value : curRow.find('.g-widget-metadata-value-input').val();
        if (this.newDatum && tempKey === '') {
            events.trigger('g:alert', {
                text: 'A key is required for all metadata.',
                type: 'warning'
            });
            return false;
        }
        var saveCallback = () => {
            this.key = tempKey;
            this.value = tempValue;

            this.parentView.key = this.key;
            this.parentView.value = this.value;
            if (this instanceof JsonMetadatumEditWidget) {
                this.parentView.mode = 'json';
            } else {
                this.parentView.mode = 'simple';
            }
            // re-render metadata panel header when metadata is edited
            this.parentView.parentView.trigger('h-metadata-panel-update', {
            });
            this.parentView.render();
            this.newDatum = false;
        };

        var errorCallback = function (out) {
            events.trigger('g:alert', {
                text: out.message,
                type: 'danger'
            });
        };

        if (this.newDatum) {
            if (this.onMetadataAdded) {
                this.onMetadataAdded(tempKey, tempValue, saveCallback, errorCallback);
            } else {
                if (this.noSave) {
                    if (getMetadataRecord(this.item, this.fieldName)[tempKey] !== undefined) {
                        events.trigger('g:alert', {
                            text: tempKey + ' is already a metadata key',
                            type: 'warning'
                        });
                        return false;
                    }
                    getMetadataRecord(this.item, this.fieldName)[tempKey] = tempValue;
                    this.parentView.parentView.render();
                    return;
                }
                this.item.addMetadata(tempKey, tempValue, saveCallback, errorCallback, {
                    field: this.fieldName,
                    path: this.apiPath
                });
            }
        } else {
            if (this.onMetadataEdited) {
                this.onMetadataEdited(tempKey, this.key, tempValue, saveCallback, errorCallback);
            } else {
                if (this.noSave) {
                    tempKey = tempKey === '' ? this.key : tempKey;
                    if (tempKey !== this.key && getMetadataRecord(this.item, this.fieldName)[tempKey] !== undefined) {
                        events.trigger('g:alert', {
                            text: tempKey + ' is already a metadata key',
                            type: 'warning'
                        });
                        return false;
                    }
                    delete getMetadataRecord(this.item, this.fieldName)[this.key];
                    getMetadataRecord(this.item, this.fieldName)[tempKey] = tempValue;
                    this.parentView.parentView.render();
                    return;
                }
                this.item.editMetadata(tempKey, this.key, tempValue, saveCallback, errorCallback, {
                    field: this.fieldName,
                    path: this.apiPath
                });
            }
        }
    },

    render: function () {
        this.$el.html(this.editTemplate({
            item: this.item,
            key: this.key,
            value: this.value,
            accessLevel: this.accessLevel,
            newDatum: this.newDatum,
            AccessType
        }));
        this.$el.find('.g-widget-metadata-key-input').trigger('focus');
        return this;
    }
});

var JsonMetadatumEditWidget = MetadatumEditWidget.extend({
    editTemplate: JsonMetadatumEditWidgetTemplate,

    getCurrentValue: function () {
        return this.editor.getText();
    },

    save: function (event) {
        try {
            MetadatumEditWidget.prototype.save.call(
                this, event, this.editor.get());
        } catch (err) {
            events.trigger('g:alert', {
                text: 'The field contains invalid JSON and can not be saved.',
                type: 'warning'
            });
            return false;
        }
    },

    render: function () {
        MetadatumEditWidget.prototype.render.apply(this, arguments);

        const jsonEditorEl = this.$el.find('.g-json-editor');
        this.editor = new JSONEditor(jsonEditorEl[0], {
            mode: 'tree',
            modes: ['code', 'tree'],
            onError: () => {
                events.trigger('g:alert', {
                    text: 'The field contains invalid JSON and can not be viewed in Tree Mode.',
                    type: 'warning'
                });
            }
        });

        if (this.value !== undefined) {
            this.editor.setText(JSON.stringify(this.value));
            this.editor.expandAll();
        }
        return this;
    }
});

/**
 * This widget shows a list of metadata in a given item.
 */
var MetadataWidget = Panel.extend({
    events: _.extend(Panel.prototype.events, {
        'click .g-add-json-metadata': function (event) {
            this.addMetadata(event, 'json');
        },
        'click .g-add-simple-metadata': function (event) {
            this.addMetadata(event, 'simple');
        },
        'click .h-panel-maximize': function (event) {
            this.expand(event);
            this.$('.s-panel-content').addClass('in');
            const panelElem = this.$el.closest('.s-panel');
            const maximize = !panelElem.hasClass('h-panel-maximized');
            panelElem.toggleClass('h-panel-maximized', maximize);
            panelElem.toggleClass('s-no-panel-toggle', maximize);
        }
    }),

    /**
     * Creates a widget to display and optionally edit metadata fields.
     *
     * @param settings.item {Model} The model object whose metadata to display.
     *    Can be any model type that inherits MetadataMixin.
     * @param [settings.fieldName='meta'] {string} The name of the model attribute
     *    to display/edit. The model attribute with this name should be an object
     *    whose top level keys represent metadata keys.
     * @param [settings.title='Metadata'] {string} Title for the widget.
     * @param [settings.apiPath] {string} The relative API path to use when editing
     *    metadata keys for this model. Defaults to using the MetadataMixin default path.
     * @param [settings.accessLevel=AccessType.READ] {AccessType} The
     *    access level for this widget. Use READ for read-only, or WRITE (or greater)
     *    for adding editing capabilities as well.
     * @param [settings.onMetadataAdded] {Function} A custom callback for when a
     *    new metadata key is added to the list. If passed, will override the
     *    default behavior of calling MetadataMixin.addMetadata.
     * @param [settings.onMetadataEdited] {Function} A custom callback for when an
     *    existing metadata key is updated. If passed, will override the default
     *    behavior of calling MetadataMixin.editMetadata.
     */

    initialize: function (settings) {
        this.fieldName = settings.fieldName || 'meta';
        this.title = settings.title || 'Metadata';
        this.apiPath = settings.apiPath;
        this.accessLevel = settings.accessLevel;
        this.onMetadataEdited = settings.onMetadataEdited;
        this.panel = settings.panel === undefined ? true : settings.panel;
        this.noSave = settings.noSave;
        // the event is created
        this.on('h-metadata-panel-update', (event) => {
            this.renderMetadataWidgetHeader(event);
        });
    },

    modes: {
        simple: {
            editor: function (args) {
                return new MetadatumEditWidget(args);
            },
            displayValue: function () {
                return this.value;
            },
            template: MetadatumViewTemplate
        },
        json: {
            editor: function (args) {
                if (args.value !== undefined) {
                    args.value = JSON.parse(args.value);
                }
                return new JsonMetadatumEditWidget(args);
            },
            displayValue: function () {
                return JSON.stringify(this.value, null, 4);
            },
            validation: {
                from: {
                    simple: [
                        function (value) {
                            try {
                                JSON.parse(value);
                                return true;
                            } catch (e) {}

                            return false;
                        },
                        'The simple field is not valid JSON and can not be converted.'
                    ]
                }
            },
            template: JsonMetadatumViewTemplate
        }
    },

    setItem: function (item) {
        this.item = item;
        this.item.on('g:changed', function () {
            this.render();
        }, this);
        this.render();
        return this;
    },

    // Does not support modal editing
    getModeFromValue: function (value) {
        return _.isString(value) ? 'simple' : 'json';
    },

    addMetadata: function (event, mode) {
        var EditWidget = this.modes[mode].editor;
        var value = (mode === 'json') ? '{}' : '';
        // expand the widget when adding new metadata
        this.$('.s-panel-content').collapse('show');
        var widget = new MetadatumWidget({
            className: 'g-widget-metadata-row editing',
            mode,
            key: '',
            value,
            item: this.item,
            fieldName: this.fieldName,
            apiPath: this.apiPath,
            accessLevel: this.accessLevel,
            parentView: this,
            noSave: this.noSave,
            onMetadataEdited: this.onMetadataEdited,
            onMetadataAdded: this.onMetadataAdded
        });
        widget.$el.appendTo(this.$('.g-widget-metadata-container'));

        new EditWidget({
            item: this.item,
            key: '',
            value,
            fieldName: this.fieldName,
            apiPath: this.apiPath,
            accessLevel: this.accessLevel,
            noSave: this.noSave,
            newDatum: true,
            parentView: widget,
            onMetadataEdited: this.onMetadataEdited,
            onMetadataAdded: this.onMetadataAdded
        })
            .render()
            .$el.appendTo(widget.$el);
    },

    renderMetadataWidgetHeader: function () {
        // prevent automatically collapsing the widget after rendering again
        this.render();
    },

    render: function () {
        if (this.item && this.item.id) {
            let func = this.item.getAccessLevel;
            if (this.item.get('_modelType') === 'annotation') {
                func = (callback) => {
                    const accessLevel = this.item.getAccessLevel();
                    callback(accessLevel);
                };
            }
            func.call(this.item, (accessLevel) => {
                const fieldParts = this.fieldName.split('.');
                let metaDict = this.item.get(fieldParts[0]) || {};
                fieldParts.slice(1).forEach((part) => {
                    metaDict = metaDict[part] || {};
                });
                if (this.item[this.fieldName]) {
                    metaDict = this.item[this.fieldName];
                }
                var metaKeys = Object.keys(metaDict);
                metaKeys.sort(localeSort);
                const firstKey = (metaKeys)[0];
                let firstValue = metaDict[firstKey];
                if (_.isObject(firstValue)) {
                    // if the value is a json object, JSON.stringify to make it more readable
                    firstValue = JSON.stringify(firstValue);
                }
                this.$el.html(metadataWidgetTemplate({
                    item: this.item,
                    title: this.title,
                    firstKey,
                    firstValue,
                    accessLevel: this.item.attributes._accessLevel,
                    AccessType,
                    panel: this.panel,
                    // if never rendered, the jquery selector will be empty and won't be visible
                    collapsed: this.panel && !this.$('.s-panel-content').hasClass('in') && !this.$el.closest('.s-panel').hasClass('h-panel-maximized')
                }));
                // Append each metadatum
                _.each(metaKeys, function (metaKey) {
                    this.$el.find('.g-widget-metadata-container').append(new MetadatumWidget({
                        mode: this.getModeFromValue(metaDict[metaKey]),
                        key: metaKey,
                        value: metaDict[metaKey],
                        accessLevel: this.item.attributes._accessLevel,
                        parentView: this,
                        fieldName: this.fieldName,
                        apiPath: this.apiPath,
                        noSave: this.noSave,
                        onMetadataEdited: this.onMetadataEdited,
                        onMetadataAdded: this.onMetadataAdded
                    }).render().$el);
                }, this);
            });
        }
        return this;
    }
});

export default MetadataWidget;
