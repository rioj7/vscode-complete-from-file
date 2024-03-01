# Complete from File

Define files with words or sentenses that will be shown as completion items. Group these files by languageID. A particular file can be used for multiple languageIDs.

Some languages show the suggestions automatic and for some you have to request suggestions with the command:  
**Trigger Suggest** (key: `ctrl+space`, commandID: `editor.action.triggerSuggest`)

The files can contain empty lines and comments: lines starting with `//` or `#`.

## Configuration

The extension has the following settings:

* `complete-from-file.documents` : [`object`] Every key is a description text of the languageIDs and files used. The properties of these objects are:
  * `documentSelectors` : An array of [DocumentFilter](https://code.visualstudio.com/api/references/vscode-api#DocumentFilter) objects. It determines in which files a suggestion is provided.  
    The `pattern` property is a GlobPatternExtra string. It also supports the RegularExpression [Look(ahead|behind)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Assertions#other_assertions) assertions. This is used if you want to have different completion files for the generic languageID files (see example). Every file should only match on 1 `documentSelectors`. If you need to use the `()` characters literal you have to escape them `"**/*\\(foo\\)*.md"` (double because you are writing this in a JSON file)  
    Example: `[{ "language": "plaintext", "scheme": "file" }]`  
    In the documentation you can find a list of [language identifiers](https://code.visualstudio.com/docs/languages/identifiers). There are more language identifiers if you have additional language extensions installed.
  * `files` : An array of strings. Each string is a file path containing lines that are shown as completion items. The strings can contain [variables](#variables). If the string after variable substitution is identical to the file system path of the file as used by VSC the changes of these word files are detected and used. You can change and add these files without restarting VSC.
* `complete-from-file.minimalCharacterCount` : [`int`] (Optional) How many characters to type before a completion suggestion is made. (default: `3`)

**Note**: If you change the name of the file and it now matches a different `pattern` you have to change to a different file (or close the file) and goto/reopen the file again.

### Example

An example configuration is

```json
  "complete-from-file.documents": {
    "markdown completions": {
      "documentSelectors": [{ "language": "markdown", "scheme": "file" }],
      "files": [
        "${workspaceFolder}${pathSeparator}markdown-complete.txt",
        "${userHome}${pathSeparator}completions${pathSeparator}markdown-complete.txt"
      ]
    },
    "text files": {
      "documentSelectors": [{ "language": "plaintext", "scheme": "file" }],
      "files": [
        "${workspaceFolder}${pathSeparator}plaintext-complete.txt"
      ]
    }
  }
```

If you want to use different completion files for files that match a certain pattern you can use the following configuration.  
The `pattern` for the generic markdown files needs to exclude all the other patterns used for specialization of markdown files.

```json
  "complete-from-file.documents": {
    "markdownExtra": {
      "documentSelectors": [
        { "language": "markdown", "scheme": "file", "pattern": "**/*extra*.md" },
        { "language": "markdown", "scheme": "file", "pattern": "**/*special*.md" }
      ],
      "files": [
        "${workspaceFolder}${pathSeparator}markdown-complete.txt",
        "${workspaceFolder}${pathSeparator}markdown-complete-extra.txt"
      ]
    },
    "markdown": {
      "documentSelectors": [
        { "language": "markdown", "scheme": "file", "pattern": "**/(?!*extra*.md|*special*.md)*.md" }
      ],
      "files": [
        "${workspaceFolder}${pathSeparator}markdown-complete.txt"
      ]
    },
    "text files": {
      "documentSelectors": [{ "language": "plaintext", "scheme": "file" }],
      "files": [
        "${workspaceFolder}${pathSeparator}plaintext-complete.txt"
      ]
    }
  }
```

## Variables

The extenstion supports the following variables:

* <code>&dollar;{env:<em>name</em>}</code> : get the value for environment variable <code><em>name</em></code>
* <code>&dollar;{pathSeparator}</code> : the character used by the operating system to separate components in file paths
* <code>&dollar;{userHome}</code> : the path of the user's home folder
* `${workspaceFolder}` : the path of the workspace folder opened in VS Code containing the current file.
* <code>&dollar;{workspaceFolder:<em>name</em>}</code> : the path of the workspace folder with the specified _name_ opened in VS Code
