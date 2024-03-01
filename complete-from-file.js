const vscode = require('vscode');

let configName = 'complete-from-file';

class TrieNode {
  constructor(key) {
    this.key = key;
    this.parent = null;
    this.children = {};
    this.end = false;
  }
  getWord() {
    let word = '';
    let node = this;
    while (node !== null && node.key !== null) {
      word = node.key + word;
      node = node.parent;
    }
    return word;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode(null);
  }
  _findNode(word) {
    if (word.lenth === 0) { return null; }
    let node = this.root;
    for (let i = 0; i < word.length; i++) {
      node = node.children[word[i]];
      if (!node) { return null; }
    }
    return node;
  }
  contains(word) {
    let node = this._findNode(word);
    return node === null ? false : node.end;
  }
  insert(word) {
    if (word.lenth === 0) { return; }
    if (this.contains(word)) { return; }
    let node = this.root;
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (!node.children[char]) {
        node.children[char] = new TrieNode(char);
        node.children[char].parent = node;
      }
      node = node.children[char];
    }
    node.end = true;
  }
  find(prefix) {
    let words = [];
    let node = prefix.length === 0 ? this.root : this._findNode(prefix);
    if (node) { this._findAllWords(node, words); }
    return words;
  }
  _findAllWords(node, words) {
    if (node.end) {
      words.push(node.getWord());
    }
    for (let child in node.children) {
      this._findAllWords(node.children[child], words);
    }
  }
}

/** @param {string} pattern  */
function convertGlobPattern2Regex(pattern) {
  let regexstr = pattern.replace(/\*\*|\*|\(\?|\?|\{.+?\}|\[!|\./g, m => {
    if (m === '**') { return '.*'; }
    if (m === '*') { return '[^/]*'; }
    if (m === '?') { return '.'; }
    if (m === '[!') { return '[^'; }
    if (m === '.') { return '\\.'; }
    if (m.startsWith('{')) { return `(${m.slice(1, m.length-1).replace(',','|')})`; }
    return m;
  });
  return new RegExp(`^${regexstr}$`);
}

class TrieFilePatterns {
  constructor() {
    this.trie = new Trie();
    this.filepathRegex = [];
  }
  addPattern(pattern) {
    this.filepathRegex.push(convertGlobPattern2Regex(pattern));
  }
  testFilepath(filepath) {
    return this.filepathRegex.some( regex => regex.test(filepath) );
  }
}

function getProperty(obj, prop, deflt) { return obj.hasOwnProperty(prop) ? obj[prop] : deflt; }
function isString(obj) { return typeof obj === 'string';}
function errorMessage(msg, noObject) { vscode.window.showErrorMessage(msg); return noObject ? noObject : "Unknown";}
function dblQuest(value, deflt) { return value !== undefined ? value : deflt; }

function utf8_to_str (src, off, lim) {  // https://github.com/quicbit-js/qb-utf8-to-str-tiny
  lim = lim == null ? src.length : lim;
  for (var i = off || 0, s = ''; i < lim; i++) {
    var h = src[i].toString(16);
    if (h.length < 2) h = '0' + h;
    s += '%' + h;
  }
  return decodeURIComponent(s);
}
function URIWorkspaceFolder(uri, action) {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) { return errorMessage('No folder open'); }
  let wsf = undefined;
  if (folders.length > 1) {
    if (!uri) { return errorMessage('Use the name of the Workspace Folder'); }
    wsf = vscode.workspace.getWorkspaceFolder(uri);
  }
  if (!wsf) {
    wsf = folders[0];  // choose first folder in the list
  }
  return action(wsf);
}
function getNamedWorkspaceFolder(name) {
  const folders = dblQuest(vscode.workspace.workspaceFolders, []);
  let filterPred = w => w.name === name;
  if (name.indexOf('/') >= 0) { filterPred = w => w.uri.path.endsWith(name); }
  let wsfLst = folders.filter(filterPred);
  if (wsfLst.length === 0) {
    errorMessage(`Workspace not found with name: ${name}`);
    return undefined;
  }
  return wsfLst[0];
};
function variableSubstitution(text) {
  const editor = vscode.window.activeTextEditor;
  let uri = undefined;
  if (!isString(text)) { return text; }
  var result = text;
  result = result.replace(/\$\{pathSeparator\}/g, process.platform === 'win32' ? '\\' : '/');
  result = result.replace(/\$\{userHome\}/g, process.platform === 'win32' ? '${env:HOMEDRIVE}${env:HOMEPATH}' : '${env:HOME}');
  result = result.replace(/\$\{env:([^}]+)\}/g, (m, p1) => {
    return getProperty(process.env, p1, '');
  });
  if (!uri && editor) { uri = editor.document.uri; }
  result = result.replace(/\$\{workspaceFolder\}/g, m => {
    return URIWorkspaceFolder(uri, workspaceFolder => {
      return workspaceFolder.uri.fsPath;
    });
  });
  result = result.replace(/\$\{workspaceFolder:(.+?)\}/g, (m, p1) => {
    let wsf = getNamedWorkspaceFolder(p1);
    if (!wsf) { return 'Unknown'; }
    return wsf.uri.fsPath;
  });
  return result;
};

async function readFileContent(filePath) {
  filePath = variableSubstitution(filePath);
  let uri = vscode.Uri.file(filePath);
  let contentUTF8 = await vscode.workspace.fs.readFile(uri);
  return utf8_to_str(contentUTF8);
};

function activate(context) {
  let languageIDProviderRegistered = new Set();
  let languageID2Trie = {};
  let documents = {};
  let minimalCharacterCount = 3;
  let completionItemProvider = {
    /** @param {vscode.TextDocument} document @param {vscode.Position} position */
    provideCompletionItems(document, position) {
      let tfp = languageID2Trie[document.languageId];
      if (!tfp) { return undefined; }
      let trie = tfp.trie;
      const linePrefix = document.lineAt(position).text.substring(0, position.character).trimStart();
      const match = linePrefix.match(/(\w+)$/);
      if (!match) { return undefined; }
      let prefix = match[1];
      if (prefix.length < minimalCharacterCount) { return undefined; }
      const range = new vscode.Range(position.line, position.character - prefix.length, position.line, position.character);
      let result = [];
      trie.find(prefix).forEach(word => {
        let item = new vscode.CompletionItem(word, vscode.CompletionItemKind.Text);
        item.range = range;
        result.push(item);
      });
      return result;
    }
  };
  function updateConfig() {
    let configuration = vscode.workspace.getConfiguration(configName, null);
    documents = configuration.get('documents');
    minimalCharacterCount = Math.max(configuration.get('minimalCharacterCount'), 1);
    languageID2Trie = {};
  }
  updateConfig();
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration( e => {
    if (!e.affectsConfiguration(configName)) { return; }
    updateConfig();
  }));
  const ExitLoop = false;
  const ContinueLoop = true;
  async function onMatchLanguageID(check_languageID, collectSelectors, async_action_file) {
    for (const description in documents) {
      if (!documents.hasOwnProperty(description)) { continue; }
      let config = documents[description];
      let selectors = getProperty(config, 'documentSelectors');
      if (!selectors) { continue; }
      let loopSelectors = languageIDMatch => {
        for (const selector of selectors) {
          let languageIDSelector = getProperty(selector, 'language');
          if (!languageIDSelector) { continue; }
          if (!check_languageID(languageIDSelector, selector)) { continue; }
          if (languageIDMatch() === ExitLoop) { return; }
        }
      };
      let languageIDMatch = false;
      loopSelectors( () => { languageIDMatch = true; return ExitLoop; } );
      if (languageIDMatch) {
        let resultCollect = collectSelectors();
        if (resultCollect) {
          loopSelectors( () => ContinueLoop );
        }
        for (const filePath of getProperty(config, 'files', [])) {
          if ((await async_action_file(filePath)) === ExitLoop) { return; }
        }
        if (resultCollect) {  // inside changeActiveTextEditor
          return; // we have a match. no need to look for other descriptions
        }
      }
    }
  }
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument( async document => {
    await onMatchLanguageID( () => true, // check_languageID
      () => false, // collectSelectors
      async filePath => {
        if (document.fileName === variableSubstitution(filePath)) {
          updateConfig();
          return ExitLoop;
        }
        return ContinueLoop;
    });
  }));
  /** @param {vscode.TextEditor} editor */
  async function changeActiveTextEditor(editor) {
    if (!editor) { return; }
    let languageIDEditor = editor.document.languageId;
    let tfp = languageID2Trie[languageIDEditor];
    if (tfp !== undefined) {
      if (tfp !== null && tfp.testFilepath(editor.document.uri.path)) {
        return;
      }
      delete languageID2Trie[languageIDEditor];
    }
    await onMatchLanguageID(
      (languageIDSelector, selector) => {
        if (languageIDSelector !== languageIDEditor) { return false; }
        let tfp = languageID2Trie[languageIDEditor];
        if (tfp === undefined) { tfp = new TrieFilePatterns(); }
        tfp.addPattern(getProperty(selector, 'pattern', '**'));  // match all paths if 'pattern' not found
        return tfp.testFilepath(editor.document.uri.path);
      },
      () => { // collectSelectors
        if (!languageIDProviderRegistered.has(languageIDEditor)) {
          context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ "language": languageIDEditor, "scheme": "file" }, completionItemProvider));
          languageIDProviderRegistered.add(languageIDEditor);
        }
        languageID2Trie[languageIDEditor] = new TrieFilePatterns();
        return true;
      },
      async (filePath) => {
        let trie = languageID2Trie[languageIDEditor].trie;
        let content = await readFileContent(filePath);
        for (const line of content.split(/\r?\n/)) {
          if (line.match(/^\s*($|\/\/|#)/)) { continue; }  // check empty and comment lines
          trie.insert(line);
        }
        return ContinueLoop; // process next filePath
      });
    if (languageID2Trie[languageIDEditor] === undefined) {
      languageID2Trie[languageIDEditor] = null;
    }
  }
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor( editor => changeActiveTextEditor(editor) ));
  changeActiveTextEditor(vscode.window.activeTextEditor);
}

function deactivate() {
}

module.exports = {
  activate,
  deactivate
}
