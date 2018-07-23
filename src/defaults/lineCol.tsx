import React from 'react';
import { TextItem } from '../component/text';

import {
    JupyterLabPlugin,
    JupyterLab,
    ApplicationShell
} from '@jupyterlab/application';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import {
    VDomRenderer,
    VDomModel,
    ReactElementWidget
} from '@jupyterlab/apputils';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { IEditorTracker, FileEditor } from '@jupyterlab/fileeditor';
import { ISignal } from '@phosphor/signaling';
import { Cell } from '@jupyterlab/cells';
import { IObservableMap } from '@jupyterlab/observables';
import {
    DocumentRegistry,
    IDocumentWidget,
    DocumentWidget
} from '@jupyterlab/docregistry';
import { IDisposable } from '@phosphor/disposable';
import { Token } from '@phosphor/coreutils';
import { Widget } from '@phosphor/widgets';
import { IStatusContext } from '../contexts';

import { showPopup, Popup } from '../component/hover';
import { lineForm } from '../component/style/lineForm';
import { IDefaultsManager } from './manager';

export namespace LineForm {
    export interface IProps {
        // editor: CodeEditor.IEditor | null;
        handleSubmit: (value: number) => void;
    }
    export interface IState {
        value: number;
    }
}
class LineForm extends React.Component<LineForm.IProps, LineForm.IState> {
    state = {
        value: 0
    };
    constructor(props: LineForm.IProps) {
        super(props);
        this.handleChange = this.handleChange.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
    }
    handleChange(event: any) {
        this.setState({ value: event.target.value });
    }
    handleSubmit(event: any) {
        event.preventDefault();
        this.props.handleSubmit(this.state.value);
    }

    render() {
        return (
            <div>
                <form onSubmit={this.handleSubmit} className={lineForm}>
                    <label>
                        <input
                            type="text"
                            value={this.state.value}
                            onChange={this.handleChange}
                        />
                        <div>Go to Line number</div>
                    </label>
                </form>
            </div>
        );
    }
}

namespace LineColComponent {
    export interface IProps {
        line: number;
        column: number;
        handleClick: () => void;
    }
}

// tslint:disable-next-line:variable-name
const LineColComponent = (
    props: LineColComponent.IProps
): React.ReactElement<LineColComponent.IProps> => {
    return (
        <div title="Go to line number" onClick={props.handleClick}>
            <TextItem source={'Ln ' + props.line + ', Col ' + props.column} />
        </div>
    );
};

class LineCol extends VDomRenderer<LineCol.Model> implements ILineCol {
    constructor(opts: LineCol.IOptions) {
        super();

        this._notebookTracker = opts.notebookTracker;
        this._editorTracker = opts.editorTracker;
        this._shell = opts.shell;

        this._notebookTracker.currentChanged.connect(this._onNotebookChange);
        this._notebookTracker.activeCellChanged.connect(
            this._onActiveCellChange
        );
        this._notebookTracker.selectionChanged.connect(this._onNotebookChange);

        this._editorTracker.currentChanged.connect(this._onEditorChange);

        this._shell.currentChanged.connect(this._onMainAreaCurrentChange);

        this.model = new LineCol.Model(
            this._getFocusedEditor(this._shell.currentWidget)
        );
    }

    protected render(): React.ReactElement<LineColComponent.IProps> | null {
        if (this.model === null) {
            return null;
        } else {
            return (
                <LineColComponent
                    line={this.model.line}
                    column={this.model.column}
                    handleClick={this._handleClick}
                />
            );
        }
    }

    private _handleClick = () => {
        const body = new ReactElementWidget(
            <LineForm handleSubmit={this._handleSubmit} />
        );
        this._popup = showPopup({
            body: body,
            position: this.node.getBoundingClientRect()
        });
    };

    private _handleSubmit = (value: number) => {
        this.model!.editor!.setCursorPosition({ line: value - 1, column: 0 });
        this._popup!.dispose();
        this.model!.editor!.focus();
    };
    private _onNotebookChange = (tracker: INotebookTracker) => {
        this.model!.editor = tracker.activeCell && tracker.activeCell.editor;
    };

    private _onActiveCellChange = (
        _tracker: INotebookTracker,
        cell: Cell | null
    ) => {
        this.model!.editor = cell && cell.editor;
    };

    private _onEditorChange = (
        _tracker: IEditorTracker,
        document: IDocumentWidget<FileEditor, DocumentRegistry.IModel> | null
    ) => {
        this.model!.editor = document && document.content.editor;
    };

    private _getFocusedEditor(val: Widget | null): CodeEditor.IEditor | null {
        if (val === null) {
            return null;
        } else {
            if (val instanceof NotebookPanel) {
                const activeCell = (val as NotebookPanel).content.activeCell;
                if (activeCell === undefined) {
                    return null;
                } else {
                    return activeCell.editor;
                }
            } else if (
                val instanceof DocumentWidget &&
                val.content instanceof FileEditor
            ) {
                return (val as DocumentWidget<FileEditor>).content.editor;
            } else {
                return null;
            }
        }
    }

    private _onMainAreaCurrentChange = (
        shell: ApplicationShell,
        change: ApplicationShell.IChangedArgs
    ) => {
        const { newValue } = change;
        const editor = this._getFocusedEditor(newValue);
        this.model!.editor = editor;
    };

    private _notebookTracker: INotebookTracker;
    private _editorTracker: IEditorTracker;
    private _shell: ApplicationShell;
    private _popup: Popup | undefined;
}

namespace LineCol {
    export class Model extends VDomModel implements ILineCol.IModel {
        constructor(editor: CodeEditor.IEditor | null) {
            super();

            this.editor = editor;
        }

        get editor(): CodeEditor.IEditor | null {
            return this._editor;
        }

        set editor(editor: CodeEditor.IEditor | null) {
            this._editor = editor;

            if (this._editor === null) {
                this._column = 0;
                this._line = 0;
            } else {
                this._editor.model.selections.changed.connect(
                    this._onSelectionChanged
                );

                const pos = this._editor.getCursorPosition();
                this._column = pos.column;
                this._line = pos.line;
            }

            this.stateChanged.emit(void 0);
        }

        get line(): number {
            return this._line;
        }

        get column(): number {
            return this._column;
        }

        private _onSelectionChanged = (
            selections: IObservableMap<CodeEditor.ITextSelection[]>,
            change: IObservableMap.IChangedArgs<CodeEditor.ITextSelection[]>
        ) => {
            let pos = this.editor!.getCursorPosition();
            this._line = pos.line;
            this._column = pos.column;

            this.stateChanged.emit(void 0);
        };

        private _line: number = 0;
        private _column: number = 0;
        private _editor: CodeEditor.IEditor | null = null;
    }

    export interface IOptions {
        notebookTracker: INotebookTracker;
        editorTracker: IEditorTracker;
        shell: ApplicationShell;
    }
}

export interface ILineCol extends IDisposable {
    readonly model: ILineCol.IModel | null;
    readonly modelChanged: ISignal<this, void>;
}

export namespace ILineCol {
    export interface IModel {
        readonly line: number;
        readonly column: number;
        readonly editor: CodeEditor.IEditor | null;
    }
}

// tslint:disable-next-line:variable-name
export const ILineCol = new Token<ILineCol>('jupyterlab-statusbar/ILineCol');

export const lineColItem: JupyterLabPlugin<ILineCol> = {
    id: 'jupyterlab-statusbar/default-items:line-col',
    autoStart: true,
    provides: ILineCol,
    requires: [IDefaultsManager, INotebookTracker, IEditorTracker],
    activate: (
        app: JupyterLab,
        defaultsManager: IDefaultsManager,
        notebookTracker: INotebookTracker,
        editorTracker: IEditorTracker
    ) => {
        let item = new LineCol({
            shell: app.shell,
            notebookTracker,
            editorTracker
        });

        defaultsManager.addDefaultStatus('line-col-item', item, {
            align: 'right',
            priority: 2,
            isActive: IStatusContext.delegateActive(app.shell, [
                { tracker: notebookTracker },
                { tracker: editorTracker }
            ])
        });

        return item;
    }
};
