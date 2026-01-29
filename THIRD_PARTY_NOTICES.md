# Third-Party & Open Source Notices

This project is licensed under the Varian Limited Use Software License Agreement (`License`) and is **not** an open-source project.

It may bundle and/or reference third-party components that are distributed under their own licenses. This file documents those third-party components **as found in this repository** to help you meet attribution requirements.

If you add, remove, or upgrade third-party dependencies, update this file accordingly.

## Bundled JavaScript Libraries (`lib/`)

### Chart.js (MIT)
- File: `lib/chart.umd.min.js`
- Identified version: 4.4.2 (from file header)
- License: MIT (per file header)
- Copyright: (c) 2024 Chart.js Contributors (per file header)

### chartjs-plugin-annotation (MIT)
- File: `lib/chartjs-plugin-annotation.min.js`
- Identified version: 3.0.1 (from file header)
- License: MIT (per file header)
- Copyright: (c) 2023 chartjs-plugin-annotation Contributors (per file header)

### chartjs-plugin-zoom (MIT)
- File: `lib/chartjs-plugin-zoom.min.js`
- Identified version: 2.0.1 (from file header)
- License: MIT (per file header)
- Copyright: (c) 2016–2023 chartjs-plugin-zoom Contributors (per file header)
- Note: The plugin supports touch gestures via HammerJS in some configurations; this repository does not bundle HammerJS separately.

### dcmjs (MIT; may include additional embedded components)
- File: `lib/dcmjs.js`
- License: MIT (per file header; embedded subcomponents may carry their own notices)
- Notes observed in file headers include:
  - `loglevel` (MIT)
  - `pako` (MIT and zlib)
  - `lodash` (MIT)

### dicom-parser (license not specified in bundled header)
- File: `lib/dicom-parser.min.js`
- Identified version: 1.8.12 (from file header)
- License: Not stated in the file header in this repository. Consult the upstream project and include the required notices for the version you bundle.
- Copyright: (c) 2017 Chris Hafey (per file header)

### Tone.js (license file referenced but not present)
- File: `lib/Tone.js`
- License: The bundled file references `Tone.js.LICENSE.txt`, but that file is not present in this repository. Consult the upstream project and include the required notices for the version you bundle.

## Third-Party Services / Remote Resources

Some pages reference remote resources (e.g., embedded forms/scripts and externally hosted assets). Review the HTML/Markdown files for the exact URLs and ensure your usage complies with the applicable third-party terms.

## MIT License Text

The following is the standard MIT license text, provided for convenience when a component is identified as MIT-licensed. Individual projects may require retaining specific copyright notices.

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
