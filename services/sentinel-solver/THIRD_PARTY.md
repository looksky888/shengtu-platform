# Reference and license

VM adapted from MEIZU16/chatgpt2api, commit
`17e541e6879ae3cd92d81e64bc68815f69e2f533`, sentinel_solver/vm.js.
The 25-field layout references utils/pow.py; the FNV algorithm in the Go
client follows utils/sentinel.py and the user's requested protocol.
This is not proof that the current upstream accepts these values.

The token-cache exclusion and invalid-result detection reference basketikun/chatgpt2api
PR #418 commit e1215733088de68d8d2a9ea9ab8e26bd3df3c12f. Bounded module graph
discovery references commit ca54abc35be55400042bf89b148f64b52e3bd702.

MIT License

Copyright (c) 2026 kunkun

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
