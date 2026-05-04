#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/qrcode-generator/qrcode.js
var require_qrcode = __commonJS({
  "node_modules/qrcode-generator/qrcode.js"(exports, module) {
    var qrcode2 = (function() {
      var qrcode3 = function(typeNumber, errorCorrectionLevel) {
        var PAD0 = 236;
        var PAD1 = 17;
        var _typeNumber = typeNumber;
        var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
        var _modules = null;
        var _moduleCount = 0;
        var _dataCache = null;
        var _dataList = [];
        var _this = {};
        var makeImpl = function(test, maskPattern) {
          _moduleCount = _typeNumber * 4 + 17;
          _modules = (function(moduleCount) {
            var modules = new Array(moduleCount);
            for (var row = 0; row < moduleCount; row += 1) {
              modules[row] = new Array(moduleCount);
              for (var col = 0; col < moduleCount; col += 1) {
                modules[row][col] = null;
              }
            }
            return modules;
          })(_moduleCount);
          setupPositionProbePattern(0, 0);
          setupPositionProbePattern(_moduleCount - 7, 0);
          setupPositionProbePattern(0, _moduleCount - 7);
          setupPositionAdjustPattern();
          setupTimingPattern();
          setupTypeInfo(test, maskPattern);
          if (_typeNumber >= 7) {
            setupTypeNumber(test);
          }
          if (_dataCache == null) {
            _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
          }
          mapData(_dataCache, maskPattern);
        };
        var setupPositionProbePattern = function(row, col) {
          for (var r = -1; r <= 7; r += 1) {
            if (row + r <= -1 || _moduleCount <= row + r) continue;
            for (var c = -1; c <= 7; c += 1) {
              if (col + c <= -1 || _moduleCount <= col + c) continue;
              if (0 <= r && r <= 6 && (c == 0 || c == 6) || 0 <= c && c <= 6 && (r == 0 || r == 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        };
        var getBestMaskPattern = function() {
          var minLostPoint = 0;
          var pattern = 0;
          for (var i = 0; i < 8; i += 1) {
            makeImpl(true, i);
            var lostPoint = QRUtil.getLostPoint(_this);
            if (i == 0 || minLostPoint > lostPoint) {
              minLostPoint = lostPoint;
              pattern = i;
            }
          }
          return pattern;
        };
        var setupTimingPattern = function() {
          for (var r = 8; r < _moduleCount - 8; r += 1) {
            if (_modules[r][6] != null) {
              continue;
            }
            _modules[r][6] = r % 2 == 0;
          }
          for (var c = 8; c < _moduleCount - 8; c += 1) {
            if (_modules[6][c] != null) {
              continue;
            }
            _modules[6][c] = c % 2 == 0;
          }
        };
        var setupPositionAdjustPattern = function() {
          var pos = QRUtil.getPatternPosition(_typeNumber);
          for (var i = 0; i < pos.length; i += 1) {
            for (var j = 0; j < pos.length; j += 1) {
              var row = pos[i];
              var col = pos[j];
              if (_modules[row][col] != null) {
                continue;
              }
              for (var r = -2; r <= 2; r += 1) {
                for (var c = -2; c <= 2; c += 1) {
                  if (r == -2 || r == 2 || c == -2 || c == 2 || r == 0 && c == 0) {
                    _modules[row + r][col + c] = true;
                  } else {
                    _modules[row + r][col + c] = false;
                  }
                }
              }
            }
          }
        };
        var setupTypeNumber = function(test) {
          var bits = QRUtil.getBCHTypeNumber(_typeNumber);
          for (var i = 0; i < 18; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
          }
          for (var i = 0; i < 18; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
          }
        };
        var setupTypeInfo = function(test, maskPattern) {
          var data = _errorCorrectionLevel << 3 | maskPattern;
          var bits = QRUtil.getBCHTypeInfo(data);
          for (var i = 0; i < 15; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            if (i < 6) {
              _modules[i][8] = mod;
            } else if (i < 8) {
              _modules[i + 1][8] = mod;
            } else {
              _modules[_moduleCount - 15 + i][8] = mod;
            }
          }
          for (var i = 0; i < 15; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            if (i < 8) {
              _modules[8][_moduleCount - i - 1] = mod;
            } else if (i < 9) {
              _modules[8][15 - i - 1 + 1] = mod;
            } else {
              _modules[8][15 - i - 1] = mod;
            }
          }
          _modules[_moduleCount - 8][8] = !test;
        };
        var mapData = function(data, maskPattern) {
          var inc = -1;
          var row = _moduleCount - 1;
          var bitIndex = 7;
          var byteIndex = 0;
          var maskFunc = QRUtil.getMaskFunction(maskPattern);
          for (var col = _moduleCount - 1; col > 0; col -= 2) {
            if (col == 6) col -= 1;
            while (true) {
              for (var c = 0; c < 2; c += 1) {
                if (_modules[row][col - c] == null) {
                  var dark = false;
                  if (byteIndex < data.length) {
                    dark = (data[byteIndex] >>> bitIndex & 1) == 1;
                  }
                  var mask = maskFunc(row, col - c);
                  if (mask) {
                    dark = !dark;
                  }
                  _modules[row][col - c] = dark;
                  bitIndex -= 1;
                  if (bitIndex == -1) {
                    byteIndex += 1;
                    bitIndex = 7;
                  }
                }
              }
              row += inc;
              if (row < 0 || _moduleCount <= row) {
                row -= inc;
                inc = -inc;
                break;
              }
            }
          }
        };
        var createBytes = function(buffer, rsBlocks) {
          var offset = 0;
          var maxDcCount = 0;
          var maxEcCount = 0;
          var dcdata = new Array(rsBlocks.length);
          var ecdata = new Array(rsBlocks.length);
          for (var r = 0; r < rsBlocks.length; r += 1) {
            var dcCount = rsBlocks[r].dataCount;
            var ecCount = rsBlocks[r].totalCount - dcCount;
            maxDcCount = Math.max(maxDcCount, dcCount);
            maxEcCount = Math.max(maxEcCount, ecCount);
            dcdata[r] = new Array(dcCount);
            for (var i = 0; i < dcdata[r].length; i += 1) {
              dcdata[r][i] = 255 & buffer.getBuffer()[i + offset];
            }
            offset += dcCount;
            var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
            var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
            var modPoly = rawPoly.mod(rsPoly);
            ecdata[r] = new Array(rsPoly.getLength() - 1);
            for (var i = 0; i < ecdata[r].length; i += 1) {
              var modIndex = i + modPoly.getLength() - ecdata[r].length;
              ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
            }
          }
          var totalCodeCount = 0;
          for (var i = 0; i < rsBlocks.length; i += 1) {
            totalCodeCount += rsBlocks[i].totalCount;
          }
          var data = new Array(totalCodeCount);
          var index = 0;
          for (var i = 0; i < maxDcCount; i += 1) {
            for (var r = 0; r < rsBlocks.length; r += 1) {
              if (i < dcdata[r].length) {
                data[index] = dcdata[r][i];
                index += 1;
              }
            }
          }
          for (var i = 0; i < maxEcCount; i += 1) {
            for (var r = 0; r < rsBlocks.length; r += 1) {
              if (i < ecdata[r].length) {
                data[index] = ecdata[r][i];
                index += 1;
              }
            }
          }
          return data;
        };
        var createData = function(typeNumber2, errorCorrectionLevel2, dataList) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, errorCorrectionLevel2);
          var buffer = qrBitBuffer();
          for (var i = 0; i < dataList.length; i += 1) {
            var data = dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
            data.write(buffer);
          }
          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i += 1) {
            totalDataCount += rsBlocks[i].dataCount;
          }
          if (buffer.getLengthInBits() > totalDataCount * 8) {
            throw "code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")";
          }
          if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
            buffer.put(0, 4);
          }
          while (buffer.getLengthInBits() % 8 != 0) {
            buffer.putBit(false);
          }
          while (true) {
            if (buffer.getLengthInBits() >= totalDataCount * 8) {
              break;
            }
            buffer.put(PAD0, 8);
            if (buffer.getLengthInBits() >= totalDataCount * 8) {
              break;
            }
            buffer.put(PAD1, 8);
          }
          return createBytes(buffer, rsBlocks);
        };
        _this.addData = function(data, mode) {
          mode = mode || "Byte";
          var newData = null;
          switch (mode) {
            case "Numeric":
              newData = qrNumber(data);
              break;
            case "Alphanumeric":
              newData = qrAlphaNum(data);
              break;
            case "Byte":
              newData = qr8BitByte(data);
              break;
            case "Kanji":
              newData = qrKanji(data);
              break;
            default:
              throw "mode:" + mode;
          }
          _dataList.push(newData);
          _dataCache = null;
        };
        _this.isDark = function(row, col) {
          if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
            throw row + "," + col;
          }
          return _modules[row][col];
        };
        _this.getModuleCount = function() {
          return _moduleCount;
        };
        _this.make = function() {
          if (_typeNumber < 1) {
            var typeNumber2 = 1;
            for (; typeNumber2 < 40; typeNumber2++) {
              var rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, _errorCorrectionLevel);
              var buffer = qrBitBuffer();
              for (var i = 0; i < _dataList.length; i++) {
                var data = _dataList[i];
                buffer.put(data.getMode(), 4);
                buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
                data.write(buffer);
              }
              var totalDataCount = 0;
              for (var i = 0; i < rsBlocks.length; i++) {
                totalDataCount += rsBlocks[i].dataCount;
              }
              if (buffer.getLengthInBits() <= totalDataCount * 8) {
                break;
              }
            }
            _typeNumber = typeNumber2;
          }
          makeImpl(false, getBestMaskPattern());
        };
        _this.createTableTag = function(cellSize, margin) {
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          var qrHtml = "";
          qrHtml += '<table style="';
          qrHtml += " border-width: 0px; border-style: none;";
          qrHtml += " border-collapse: collapse;";
          qrHtml += " padding: 0px; margin: " + margin + "px;";
          qrHtml += '">';
          qrHtml += "<tbody>";
          for (var r = 0; r < _this.getModuleCount(); r += 1) {
            qrHtml += "<tr>";
            for (var c = 0; c < _this.getModuleCount(); c += 1) {
              qrHtml += '<td style="';
              qrHtml += " border-width: 0px; border-style: none;";
              qrHtml += " border-collapse: collapse;";
              qrHtml += " padding: 0px; margin: 0px;";
              qrHtml += " width: " + cellSize + "px;";
              qrHtml += " height: " + cellSize + "px;";
              qrHtml += " background-color: ";
              qrHtml += _this.isDark(r, c) ? "#000000" : "#ffffff";
              qrHtml += ";";
              qrHtml += '"/>';
            }
            qrHtml += "</tr>";
          }
          qrHtml += "</tbody>";
          qrHtml += "</table>";
          return qrHtml;
        };
        _this.createSvgTag = function(cellSize, margin, alt, title) {
          var opts = {};
          if (typeof arguments[0] == "object") {
            opts = arguments[0];
            cellSize = opts.cellSize;
            margin = opts.margin;
            alt = opts.alt;
            title = opts.title;
          }
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          alt = typeof alt === "string" ? { text: alt } : alt || {};
          alt.text = alt.text || null;
          alt.id = alt.text ? alt.id || "qrcode-description" : null;
          title = typeof title === "string" ? { text: title } : title || {};
          title.text = title.text || null;
          title.id = title.text ? title.id || "qrcode-title" : null;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var c, mc, r, mr, qrSvg = "", rect;
          rect = "l" + cellSize + ",0 0," + cellSize + " -" + cellSize + ",0 0,-" + cellSize + "z ";
          qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
          qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : "";
          qrSvg += ' viewBox="0 0 ' + size + " " + size + '" ';
          qrSvg += ' preserveAspectRatio="xMinYMin meet"';
          qrSvg += title.text || alt.text ? ' role="img" aria-labelledby="' + escapeXml([title.id, alt.id].join(" ").trim()) + '"' : "";
          qrSvg += ">";
          qrSvg += title.text ? '<title id="' + escapeXml(title.id) + '">' + escapeXml(title.text) + "</title>" : "";
          qrSvg += alt.text ? '<description id="' + escapeXml(alt.id) + '">' + escapeXml(alt.text) + "</description>" : "";
          qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
          qrSvg += '<path d="';
          for (r = 0; r < _this.getModuleCount(); r += 1) {
            mr = r * cellSize + margin;
            for (c = 0; c < _this.getModuleCount(); c += 1) {
              if (_this.isDark(r, c)) {
                mc = c * cellSize + margin;
                qrSvg += "M" + mc + "," + mr + rect;
              }
            }
          }
          qrSvg += '" stroke="transparent" fill="black"/>';
          qrSvg += "</svg>";
          return qrSvg;
        };
        _this.createDataURL = function(cellSize, margin) {
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var min = margin;
          var max = size - margin;
          return createDataURL(size, size, function(x, y) {
            if (min <= x && x < max && min <= y && y < max) {
              var c = Math.floor((x - min) / cellSize);
              var r = Math.floor((y - min) / cellSize);
              return _this.isDark(r, c) ? 0 : 1;
            } else {
              return 1;
            }
          });
        };
        _this.createImgTag = function(cellSize, margin, alt) {
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var img = "";
          img += "<img";
          img += ' src="';
          img += _this.createDataURL(cellSize, margin);
          img += '"';
          img += ' width="';
          img += size;
          img += '"';
          img += ' height="';
          img += size;
          img += '"';
          if (alt) {
            img += ' alt="';
            img += escapeXml(alt);
            img += '"';
          }
          img += "/>";
          return img;
        };
        var escapeXml = function(s) {
          var escaped = "";
          for (var i = 0; i < s.length; i += 1) {
            var c = s.charAt(i);
            switch (c) {
              case "<":
                escaped += "&lt;";
                break;
              case ">":
                escaped += "&gt;";
                break;
              case "&":
                escaped += "&amp;";
                break;
              case '"':
                escaped += "&quot;";
                break;
              default:
                escaped += c;
                break;
            }
          }
          return escaped;
        };
        var _createHalfASCII = function(margin) {
          var cellSize = 1;
          margin = typeof margin == "undefined" ? cellSize * 2 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var min = margin;
          var max = size - margin;
          var y, x, r1, r2, p;
          var blocks = {
            "\u2588\u2588": "\u2588",
            "\u2588 ": "\u2580",
            " \u2588": "\u2584",
            "  ": " "
          };
          var blocksLastLineNoMargin = {
            "\u2588\u2588": "\u2580",
            "\u2588 ": "\u2580",
            " \u2588": " ",
            "  ": " "
          };
          var ascii = "";
          for (y = 0; y < size; y += 2) {
            r1 = Math.floor((y - min) / cellSize);
            r2 = Math.floor((y + 1 - min) / cellSize);
            for (x = 0; x < size; x += 1) {
              p = "\u2588";
              if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
                p = " ";
              }
              if (min <= x && x < max && min <= y + 1 && y + 1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
                p += " ";
              } else {
                p += "\u2588";
              }
              ascii += margin < 1 && y + 1 >= max ? blocksLastLineNoMargin[p] : blocks[p];
            }
            ascii += "\n";
          }
          if (size % 2 && margin > 0) {
            return ascii.substring(0, ascii.length - size - 1) + Array(size + 1).join("\u2580");
          }
          return ascii.substring(0, ascii.length - 1);
        };
        _this.createASCII = function(cellSize, margin) {
          cellSize = cellSize || 1;
          if (cellSize < 2) {
            return _createHalfASCII(margin);
          }
          cellSize -= 1;
          margin = typeof margin == "undefined" ? cellSize * 2 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var min = margin;
          var max = size - margin;
          var y, x, r, p;
          var white = Array(cellSize + 1).join("\u2588\u2588");
          var black = Array(cellSize + 1).join("  ");
          var ascii = "";
          var line = "";
          for (y = 0; y < size; y += 1) {
            r = Math.floor((y - min) / cellSize);
            line = "";
            for (x = 0; x < size; x += 1) {
              p = 1;
              if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
                p = 0;
              }
              line += p ? white : black;
            }
            for (r = 0; r < cellSize; r += 1) {
              ascii += line + "\n";
            }
          }
          return ascii.substring(0, ascii.length - 1);
        };
        _this.renderTo2dContext = function(context, cellSize) {
          cellSize = cellSize || 2;
          var length = _this.getModuleCount();
          for (var row = 0; row < length; row++) {
            for (var col = 0; col < length; col++) {
              context.fillStyle = _this.isDark(row, col) ? "black" : "white";
              context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
            }
          }
        };
        return _this;
      };
      qrcode3.stringToBytesFuncs = {
        "default": function(s) {
          var bytes = [];
          for (var i = 0; i < s.length; i += 1) {
            var c = s.charCodeAt(i);
            bytes.push(c & 255);
          }
          return bytes;
        }
      };
      qrcode3.stringToBytes = qrcode3.stringToBytesFuncs["default"];
      qrcode3.createStringToBytes = function(unicodeData, numChars) {
        var unicodeMap = (function() {
          var bin = base64DecodeInputStream(unicodeData);
          var read = function() {
            var b = bin.read();
            if (b == -1) throw "eof";
            return b;
          };
          var count = 0;
          var unicodeMap2 = {};
          while (true) {
            var b0 = bin.read();
            if (b0 == -1) break;
            var b1 = read();
            var b2 = read();
            var b3 = read();
            var k = String.fromCharCode(b0 << 8 | b1);
            var v = b2 << 8 | b3;
            unicodeMap2[k] = v;
            count += 1;
          }
          if (count != numChars) {
            throw count + " != " + numChars;
          }
          return unicodeMap2;
        })();
        var unknownChar = "?".charCodeAt(0);
        return function(s) {
          var bytes = [];
          for (var i = 0; i < s.length; i += 1) {
            var c = s.charCodeAt(i);
            if (c < 128) {
              bytes.push(c);
            } else {
              var b = unicodeMap[s.charAt(i)];
              if (typeof b == "number") {
                if ((b & 255) == b) {
                  bytes.push(b);
                } else {
                  bytes.push(b >>> 8);
                  bytes.push(b & 255);
                }
              } else {
                bytes.push(unknownChar);
              }
            }
          }
          return bytes;
        };
      };
      var QRMode = {
        MODE_NUMBER: 1 << 0,
        MODE_ALPHA_NUM: 1 << 1,
        MODE_8BIT_BYTE: 1 << 2,
        MODE_KANJI: 1 << 3
      };
      var QRErrorCorrectionLevel = {
        L: 1,
        M: 0,
        Q: 3,
        H: 2
      };
      var QRMaskPattern = {
        PATTERN000: 0,
        PATTERN001: 1,
        PATTERN010: 2,
        PATTERN011: 3,
        PATTERN100: 4,
        PATTERN101: 5,
        PATTERN110: 6,
        PATTERN111: 7
      };
      var QRUtil = (function() {
        var PATTERN_POSITION_TABLE = [
          [],
          [6, 18],
          [6, 22],
          [6, 26],
          [6, 30],
          [6, 34],
          [6, 22, 38],
          [6, 24, 42],
          [6, 26, 46],
          [6, 28, 50],
          [6, 30, 54],
          [6, 32, 58],
          [6, 34, 62],
          [6, 26, 46, 66],
          [6, 26, 48, 70],
          [6, 26, 50, 74],
          [6, 30, 54, 78],
          [6, 30, 56, 82],
          [6, 30, 58, 86],
          [6, 34, 62, 90],
          [6, 28, 50, 72, 94],
          [6, 26, 50, 74, 98],
          [6, 30, 54, 78, 102],
          [6, 28, 54, 80, 106],
          [6, 32, 58, 84, 110],
          [6, 30, 58, 86, 114],
          [6, 34, 62, 90, 118],
          [6, 26, 50, 74, 98, 122],
          [6, 30, 54, 78, 102, 126],
          [6, 26, 52, 78, 104, 130],
          [6, 30, 56, 82, 108, 134],
          [6, 34, 60, 86, 112, 138],
          [6, 30, 58, 86, 114, 142],
          [6, 34, 62, 90, 118, 146],
          [6, 30, 54, 78, 102, 126, 150],
          [6, 24, 50, 76, 102, 128, 154],
          [6, 28, 54, 80, 106, 132, 158],
          [6, 32, 58, 84, 110, 136, 162],
          [6, 26, 54, 82, 110, 138, 166],
          [6, 30, 58, 86, 114, 142, 170]
        ];
        var G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
        var G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
        var G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
        var _this = {};
        var getBCHDigit = function(data) {
          var digit = 0;
          while (data != 0) {
            digit += 1;
            data >>>= 1;
          }
          return digit;
        };
        _this.getBCHTypeInfo = function(data) {
          var d = data << 10;
          while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
            d ^= G15 << getBCHDigit(d) - getBCHDigit(G15);
          }
          return (data << 10 | d) ^ G15_MASK;
        };
        _this.getBCHTypeNumber = function(data) {
          var d = data << 12;
          while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
            d ^= G18 << getBCHDigit(d) - getBCHDigit(G18);
          }
          return data << 12 | d;
        };
        _this.getPatternPosition = function(typeNumber) {
          return PATTERN_POSITION_TABLE[typeNumber - 1];
        };
        _this.getMaskFunction = function(maskPattern) {
          switch (maskPattern) {
            case QRMaskPattern.PATTERN000:
              return function(i, j) {
                return (i + j) % 2 == 0;
              };
            case QRMaskPattern.PATTERN001:
              return function(i, j) {
                return i % 2 == 0;
              };
            case QRMaskPattern.PATTERN010:
              return function(i, j) {
                return j % 3 == 0;
              };
            case QRMaskPattern.PATTERN011:
              return function(i, j) {
                return (i + j) % 3 == 0;
              };
            case QRMaskPattern.PATTERN100:
              return function(i, j) {
                return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
              };
            case QRMaskPattern.PATTERN101:
              return function(i, j) {
                return i * j % 2 + i * j % 3 == 0;
              };
            case QRMaskPattern.PATTERN110:
              return function(i, j) {
                return (i * j % 2 + i * j % 3) % 2 == 0;
              };
            case QRMaskPattern.PATTERN111:
              return function(i, j) {
                return (i * j % 3 + (i + j) % 2) % 2 == 0;
              };
            default:
              throw "bad maskPattern:" + maskPattern;
          }
        };
        _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
          var a = qrPolynomial([1], 0);
          for (var i = 0; i < errorCorrectLength; i += 1) {
            a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0));
          }
          return a;
        };
        _this.getLengthInBits = function(mode, type) {
          if (1 <= type && type < 10) {
            switch (mode) {
              case QRMode.MODE_NUMBER:
                return 10;
              case QRMode.MODE_ALPHA_NUM:
                return 9;
              case QRMode.MODE_8BIT_BYTE:
                return 8;
              case QRMode.MODE_KANJI:
                return 8;
              default:
                throw "mode:" + mode;
            }
          } else if (type < 27) {
            switch (mode) {
              case QRMode.MODE_NUMBER:
                return 12;
              case QRMode.MODE_ALPHA_NUM:
                return 11;
              case QRMode.MODE_8BIT_BYTE:
                return 16;
              case QRMode.MODE_KANJI:
                return 10;
              default:
                throw "mode:" + mode;
            }
          } else if (type < 41) {
            switch (mode) {
              case QRMode.MODE_NUMBER:
                return 14;
              case QRMode.MODE_ALPHA_NUM:
                return 13;
              case QRMode.MODE_8BIT_BYTE:
                return 16;
              case QRMode.MODE_KANJI:
                return 12;
              default:
                throw "mode:" + mode;
            }
          } else {
            throw "type:" + type;
          }
        };
        _this.getLostPoint = function(qrcode4) {
          var moduleCount = qrcode4.getModuleCount();
          var lostPoint = 0;
          for (var row = 0; row < moduleCount; row += 1) {
            for (var col = 0; col < moduleCount; col += 1) {
              var sameCount = 0;
              var dark = qrcode4.isDark(row, col);
              for (var r = -1; r <= 1; r += 1) {
                if (row + r < 0 || moduleCount <= row + r) {
                  continue;
                }
                for (var c = -1; c <= 1; c += 1) {
                  if (col + c < 0 || moduleCount <= col + c) {
                    continue;
                  }
                  if (r == 0 && c == 0) {
                    continue;
                  }
                  if (dark == qrcode4.isDark(row + r, col + c)) {
                    sameCount += 1;
                  }
                }
              }
              if (sameCount > 5) {
                lostPoint += 3 + sameCount - 5;
              }
            }
          }
          ;
          for (var row = 0; row < moduleCount - 1; row += 1) {
            for (var col = 0; col < moduleCount - 1; col += 1) {
              var count = 0;
              if (qrcode4.isDark(row, col)) count += 1;
              if (qrcode4.isDark(row + 1, col)) count += 1;
              if (qrcode4.isDark(row, col + 1)) count += 1;
              if (qrcode4.isDark(row + 1, col + 1)) count += 1;
              if (count == 0 || count == 4) {
                lostPoint += 3;
              }
            }
          }
          for (var row = 0; row < moduleCount; row += 1) {
            for (var col = 0; col < moduleCount - 6; col += 1) {
              if (qrcode4.isDark(row, col) && !qrcode4.isDark(row, col + 1) && qrcode4.isDark(row, col + 2) && qrcode4.isDark(row, col + 3) && qrcode4.isDark(row, col + 4) && !qrcode4.isDark(row, col + 5) && qrcode4.isDark(row, col + 6)) {
                lostPoint += 40;
              }
            }
          }
          for (var col = 0; col < moduleCount; col += 1) {
            for (var row = 0; row < moduleCount - 6; row += 1) {
              if (qrcode4.isDark(row, col) && !qrcode4.isDark(row + 1, col) && qrcode4.isDark(row + 2, col) && qrcode4.isDark(row + 3, col) && qrcode4.isDark(row + 4, col) && !qrcode4.isDark(row + 5, col) && qrcode4.isDark(row + 6, col)) {
                lostPoint += 40;
              }
            }
          }
          var darkCount = 0;
          for (var col = 0; col < moduleCount; col += 1) {
            for (var row = 0; row < moduleCount; row += 1) {
              if (qrcode4.isDark(row, col)) {
                darkCount += 1;
              }
            }
          }
          var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
          lostPoint += ratio * 10;
          return lostPoint;
        };
        return _this;
      })();
      var QRMath = (function() {
        var EXP_TABLE = new Array(256);
        var LOG_TABLE = new Array(256);
        for (var i = 0; i < 8; i += 1) {
          EXP_TABLE[i] = 1 << i;
        }
        for (var i = 8; i < 256; i += 1) {
          EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
        }
        for (var i = 0; i < 255; i += 1) {
          LOG_TABLE[EXP_TABLE[i]] = i;
        }
        var _this = {};
        _this.glog = function(n) {
          if (n < 1) {
            throw "glog(" + n + ")";
          }
          return LOG_TABLE[n];
        };
        _this.gexp = function(n) {
          while (n < 0) {
            n += 255;
          }
          while (n >= 256) {
            n -= 255;
          }
          return EXP_TABLE[n];
        };
        return _this;
      })();
      function qrPolynomial(num, shift) {
        if (typeof num.length == "undefined") {
          throw num.length + "/" + shift;
        }
        var _num = (function() {
          var offset = 0;
          while (offset < num.length && num[offset] == 0) {
            offset += 1;
          }
          var _num2 = new Array(num.length - offset + shift);
          for (var i = 0; i < num.length - offset; i += 1) {
            _num2[i] = num[i + offset];
          }
          return _num2;
        })();
        var _this = {};
        _this.getAt = function(index) {
          return _num[index];
        };
        _this.getLength = function() {
          return _num.length;
        };
        _this.multiply = function(e) {
          var num2 = new Array(_this.getLength() + e.getLength() - 1);
          for (var i = 0; i < _this.getLength(); i += 1) {
            for (var j = 0; j < e.getLength(); j += 1) {
              num2[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i)) + QRMath.glog(e.getAt(j)));
            }
          }
          return qrPolynomial(num2, 0);
        };
        _this.mod = function(e) {
          if (_this.getLength() - e.getLength() < 0) {
            return _this;
          }
          var ratio = QRMath.glog(_this.getAt(0)) - QRMath.glog(e.getAt(0));
          var num2 = new Array(_this.getLength());
          for (var i = 0; i < _this.getLength(); i += 1) {
            num2[i] = _this.getAt(i);
          }
          for (var i = 0; i < e.getLength(); i += 1) {
            num2[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
          }
          return qrPolynomial(num2, 0).mod(e);
        };
        return _this;
      }
      ;
      var QRRSBlock = (function() {
        var RS_BLOCK_TABLE2 = [
          // L
          // M
          // Q
          // H
          // 1
          [1, 26, 19],
          [1, 26, 16],
          [1, 26, 13],
          [1, 26, 9],
          // 2
          [1, 44, 34],
          [1, 44, 28],
          [1, 44, 22],
          [1, 44, 16],
          // 3
          [1, 70, 55],
          [1, 70, 44],
          [2, 35, 17],
          [2, 35, 13],
          // 4
          [1, 100, 80],
          [2, 50, 32],
          [2, 50, 24],
          [4, 25, 9],
          // 5
          [1, 134, 108],
          [2, 67, 43],
          [2, 33, 15, 2, 34, 16],
          [2, 33, 11, 2, 34, 12],
          // 6
          [2, 86, 68],
          [4, 43, 27],
          [4, 43, 19],
          [4, 43, 15],
          // 7
          [2, 98, 78],
          [4, 49, 31],
          [2, 32, 14, 4, 33, 15],
          [4, 39, 13, 1, 40, 14],
          // 8
          [2, 121, 97],
          [2, 60, 38, 2, 61, 39],
          [4, 40, 18, 2, 41, 19],
          [4, 40, 14, 2, 41, 15],
          // 9
          [2, 146, 116],
          [3, 58, 36, 2, 59, 37],
          [4, 36, 16, 4, 37, 17],
          [4, 36, 12, 4, 37, 13],
          // 10
          [2, 86, 68, 2, 87, 69],
          [4, 69, 43, 1, 70, 44],
          [6, 43, 19, 2, 44, 20],
          [6, 43, 15, 2, 44, 16],
          // 11
          [4, 101, 81],
          [1, 80, 50, 4, 81, 51],
          [4, 50, 22, 4, 51, 23],
          [3, 36, 12, 8, 37, 13],
          // 12
          [2, 116, 92, 2, 117, 93],
          [6, 58, 36, 2, 59, 37],
          [4, 46, 20, 6, 47, 21],
          [7, 42, 14, 4, 43, 15],
          // 13
          [4, 133, 107],
          [8, 59, 37, 1, 60, 38],
          [8, 44, 20, 4, 45, 21],
          [12, 33, 11, 4, 34, 12],
          // 14
          [3, 145, 115, 1, 146, 116],
          [4, 64, 40, 5, 65, 41],
          [11, 36, 16, 5, 37, 17],
          [11, 36, 12, 5, 37, 13],
          // 15
          [5, 109, 87, 1, 110, 88],
          [5, 65, 41, 5, 66, 42],
          [5, 54, 24, 7, 55, 25],
          [11, 36, 12, 7, 37, 13],
          // 16
          [5, 122, 98, 1, 123, 99],
          [7, 73, 45, 3, 74, 46],
          [15, 43, 19, 2, 44, 20],
          [3, 45, 15, 13, 46, 16],
          // 17
          [1, 135, 107, 5, 136, 108],
          [10, 74, 46, 1, 75, 47],
          [1, 50, 22, 15, 51, 23],
          [2, 42, 14, 17, 43, 15],
          // 18
          [5, 150, 120, 1, 151, 121],
          [9, 69, 43, 4, 70, 44],
          [17, 50, 22, 1, 51, 23],
          [2, 42, 14, 19, 43, 15],
          // 19
          [3, 141, 113, 4, 142, 114],
          [3, 70, 44, 11, 71, 45],
          [17, 47, 21, 4, 48, 22],
          [9, 39, 13, 16, 40, 14],
          // 20
          [3, 135, 107, 5, 136, 108],
          [3, 67, 41, 13, 68, 42],
          [15, 54, 24, 5, 55, 25],
          [15, 43, 15, 10, 44, 16],
          // 21
          [4, 144, 116, 4, 145, 117],
          [17, 68, 42],
          [17, 50, 22, 6, 51, 23],
          [19, 46, 16, 6, 47, 17],
          // 22
          [2, 139, 111, 7, 140, 112],
          [17, 74, 46],
          [7, 54, 24, 16, 55, 25],
          [34, 37, 13],
          // 23
          [4, 151, 121, 5, 152, 122],
          [4, 75, 47, 14, 76, 48],
          [11, 54, 24, 14, 55, 25],
          [16, 45, 15, 14, 46, 16],
          // 24
          [6, 147, 117, 4, 148, 118],
          [6, 73, 45, 14, 74, 46],
          [11, 54, 24, 16, 55, 25],
          [30, 46, 16, 2, 47, 17],
          // 25
          [8, 132, 106, 4, 133, 107],
          [8, 75, 47, 13, 76, 48],
          [7, 54, 24, 22, 55, 25],
          [22, 45, 15, 13, 46, 16],
          // 26
          [10, 142, 114, 2, 143, 115],
          [19, 74, 46, 4, 75, 47],
          [28, 50, 22, 6, 51, 23],
          [33, 46, 16, 4, 47, 17],
          // 27
          [8, 152, 122, 4, 153, 123],
          [22, 73, 45, 3, 74, 46],
          [8, 53, 23, 26, 54, 24],
          [12, 45, 15, 28, 46, 16],
          // 28
          [3, 147, 117, 10, 148, 118],
          [3, 73, 45, 23, 74, 46],
          [4, 54, 24, 31, 55, 25],
          [11, 45, 15, 31, 46, 16],
          // 29
          [7, 146, 116, 7, 147, 117],
          [21, 73, 45, 7, 74, 46],
          [1, 53, 23, 37, 54, 24],
          [19, 45, 15, 26, 46, 16],
          // 30
          [5, 145, 115, 10, 146, 116],
          [19, 75, 47, 10, 76, 48],
          [15, 54, 24, 25, 55, 25],
          [23, 45, 15, 25, 46, 16],
          // 31
          [13, 145, 115, 3, 146, 116],
          [2, 74, 46, 29, 75, 47],
          [42, 54, 24, 1, 55, 25],
          [23, 45, 15, 28, 46, 16],
          // 32
          [17, 145, 115],
          [10, 74, 46, 23, 75, 47],
          [10, 54, 24, 35, 55, 25],
          [19, 45, 15, 35, 46, 16],
          // 33
          [17, 145, 115, 1, 146, 116],
          [14, 74, 46, 21, 75, 47],
          [29, 54, 24, 19, 55, 25],
          [11, 45, 15, 46, 46, 16],
          // 34
          [13, 145, 115, 6, 146, 116],
          [14, 74, 46, 23, 75, 47],
          [44, 54, 24, 7, 55, 25],
          [59, 46, 16, 1, 47, 17],
          // 35
          [12, 151, 121, 7, 152, 122],
          [12, 75, 47, 26, 76, 48],
          [39, 54, 24, 14, 55, 25],
          [22, 45, 15, 41, 46, 16],
          // 36
          [6, 151, 121, 14, 152, 122],
          [6, 75, 47, 34, 76, 48],
          [46, 54, 24, 10, 55, 25],
          [2, 45, 15, 64, 46, 16],
          // 37
          [17, 152, 122, 4, 153, 123],
          [29, 74, 46, 14, 75, 47],
          [49, 54, 24, 10, 55, 25],
          [24, 45, 15, 46, 46, 16],
          // 38
          [4, 152, 122, 18, 153, 123],
          [13, 74, 46, 32, 75, 47],
          [48, 54, 24, 14, 55, 25],
          [42, 45, 15, 32, 46, 16],
          // 39
          [20, 147, 117, 4, 148, 118],
          [40, 75, 47, 7, 76, 48],
          [43, 54, 24, 22, 55, 25],
          [10, 45, 15, 67, 46, 16],
          // 40
          [19, 148, 118, 6, 149, 119],
          [18, 75, 47, 31, 76, 48],
          [34, 54, 24, 34, 55, 25],
          [20, 45, 15, 61, 46, 16]
        ];
        var qrRSBlock = function(totalCount, dataCount) {
          var _this2 = {};
          _this2.totalCount = totalCount;
          _this2.dataCount = dataCount;
          return _this2;
        };
        var _this = {};
        var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {
          switch (errorCorrectionLevel) {
            case QRErrorCorrectionLevel.L:
              return RS_BLOCK_TABLE2[(typeNumber - 1) * 4 + 0];
            case QRErrorCorrectionLevel.M:
              return RS_BLOCK_TABLE2[(typeNumber - 1) * 4 + 1];
            case QRErrorCorrectionLevel.Q:
              return RS_BLOCK_TABLE2[(typeNumber - 1) * 4 + 2];
            case QRErrorCorrectionLevel.H:
              return RS_BLOCK_TABLE2[(typeNumber - 1) * 4 + 3];
            default:
              return void 0;
          }
        };
        _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
          var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);
          if (typeof rsBlock == "undefined") {
            throw "bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel;
          }
          var length = rsBlock.length / 3;
          var list = [];
          for (var i = 0; i < length; i += 1) {
            var count = rsBlock[i * 3 + 0];
            var totalCount = rsBlock[i * 3 + 1];
            var dataCount = rsBlock[i * 3 + 2];
            for (var j = 0; j < count; j += 1) {
              list.push(qrRSBlock(totalCount, dataCount));
            }
          }
          return list;
        };
        return _this;
      })();
      var qrBitBuffer = function() {
        var _buffer = [];
        var _length = 0;
        var _this = {};
        _this.getBuffer = function() {
          return _buffer;
        };
        _this.getAt = function(index) {
          var bufIndex = Math.floor(index / 8);
          return (_buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
        };
        _this.put = function(num, length) {
          for (var i = 0; i < length; i += 1) {
            _this.putBit((num >>> length - i - 1 & 1) == 1);
          }
        };
        _this.getLengthInBits = function() {
          return _length;
        };
        _this.putBit = function(bit) {
          var bufIndex = Math.floor(_length / 8);
          if (_buffer.length <= bufIndex) {
            _buffer.push(0);
          }
          if (bit) {
            _buffer[bufIndex] |= 128 >>> _length % 8;
          }
          _length += 1;
        };
        return _this;
      };
      var qrNumber = function(data) {
        var _mode = QRMode.MODE_NUMBER;
        var _data = data;
        var _this = {};
        _this.getMode = function() {
          return _mode;
        };
        _this.getLength = function(buffer) {
          return _data.length;
        };
        _this.write = function(buffer) {
          var data2 = _data;
          var i = 0;
          while (i + 2 < data2.length) {
            buffer.put(strToNum(data2.substring(i, i + 3)), 10);
            i += 3;
          }
          if (i < data2.length) {
            if (data2.length - i == 1) {
              buffer.put(strToNum(data2.substring(i, i + 1)), 4);
            } else if (data2.length - i == 2) {
              buffer.put(strToNum(data2.substring(i, i + 2)), 7);
            }
          }
        };
        var strToNum = function(s) {
          var num = 0;
          for (var i = 0; i < s.length; i += 1) {
            num = num * 10 + chatToNum(s.charAt(i));
          }
          return num;
        };
        var chatToNum = function(c) {
          if ("0" <= c && c <= "9") {
            return c.charCodeAt(0) - "0".charCodeAt(0);
          }
          throw "illegal char :" + c;
        };
        return _this;
      };
      var qrAlphaNum = function(data) {
        var _mode = QRMode.MODE_ALPHA_NUM;
        var _data = data;
        var _this = {};
        _this.getMode = function() {
          return _mode;
        };
        _this.getLength = function(buffer) {
          return _data.length;
        };
        _this.write = function(buffer) {
          var s = _data;
          var i = 0;
          while (i + 1 < s.length) {
            buffer.put(
              getCode(s.charAt(i)) * 45 + getCode(s.charAt(i + 1)),
              11
            );
            i += 2;
          }
          if (i < s.length) {
            buffer.put(getCode(s.charAt(i)), 6);
          }
        };
        var getCode = function(c) {
          if ("0" <= c && c <= "9") {
            return c.charCodeAt(0) - "0".charCodeAt(0);
          } else if ("A" <= c && c <= "Z") {
            return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
          } else {
            switch (c) {
              case " ":
                return 36;
              case "$":
                return 37;
              case "%":
                return 38;
              case "*":
                return 39;
              case "+":
                return 40;
              case "-":
                return 41;
              case ".":
                return 42;
              case "/":
                return 43;
              case ":":
                return 44;
              default:
                throw "illegal char :" + c;
            }
          }
        };
        return _this;
      };
      var qr8BitByte = function(data) {
        var _mode = QRMode.MODE_8BIT_BYTE;
        var _data = data;
        var _bytes = qrcode3.stringToBytes(data);
        var _this = {};
        _this.getMode = function() {
          return _mode;
        };
        _this.getLength = function(buffer) {
          return _bytes.length;
        };
        _this.write = function(buffer) {
          for (var i = 0; i < _bytes.length; i += 1) {
            buffer.put(_bytes[i], 8);
          }
        };
        return _this;
      };
      var qrKanji = function(data) {
        var _mode = QRMode.MODE_KANJI;
        var _data = data;
        var stringToBytes = qrcode3.stringToBytesFuncs["SJIS"];
        if (!stringToBytes) {
          throw "sjis not supported.";
        }
        !(function(c, code) {
          var test = stringToBytes(c);
          if (test.length != 2 || (test[0] << 8 | test[1]) != code) {
            throw "sjis not supported.";
          }
        })("\u53CB", 38726);
        var _bytes = stringToBytes(data);
        var _this = {};
        _this.getMode = function() {
          return _mode;
        };
        _this.getLength = function(buffer) {
          return ~~(_bytes.length / 2);
        };
        _this.write = function(buffer) {
          var data2 = _bytes;
          var i = 0;
          while (i + 1 < data2.length) {
            var c = (255 & data2[i]) << 8 | 255 & data2[i + 1];
            if (33088 <= c && c <= 40956) {
              c -= 33088;
            } else if (57408 <= c && c <= 60351) {
              c -= 49472;
            } else {
              throw "illegal char at " + (i + 1) + "/" + c;
            }
            c = (c >>> 8 & 255) * 192 + (c & 255);
            buffer.put(c, 13);
            i += 2;
          }
          if (i < data2.length) {
            throw "illegal char at " + (i + 1);
          }
        };
        return _this;
      };
      var byteArrayOutputStream = function() {
        var _bytes = [];
        var _this = {};
        _this.writeByte = function(b) {
          _bytes.push(b & 255);
        };
        _this.writeShort = function(i) {
          _this.writeByte(i);
          _this.writeByte(i >>> 8);
        };
        _this.writeBytes = function(b, off, len) {
          off = off || 0;
          len = len || b.length;
          for (var i = 0; i < len; i += 1) {
            _this.writeByte(b[i + off]);
          }
        };
        _this.writeString = function(s) {
          for (var i = 0; i < s.length; i += 1) {
            _this.writeByte(s.charCodeAt(i));
          }
        };
        _this.toByteArray = function() {
          return _bytes;
        };
        _this.toString = function() {
          var s = "";
          s += "[";
          for (var i = 0; i < _bytes.length; i += 1) {
            if (i > 0) {
              s += ",";
            }
            s += _bytes[i];
          }
          s += "]";
          return s;
        };
        return _this;
      };
      var base64EncodeOutputStream = function() {
        var _buffer = 0;
        var _buflen = 0;
        var _length = 0;
        var _base64 = "";
        var _this = {};
        var writeEncoded = function(b) {
          _base64 += String.fromCharCode(encode(b & 63));
        };
        var encode = function(n) {
          if (n < 0) {
          } else if (n < 26) {
            return 65 + n;
          } else if (n < 52) {
            return 97 + (n - 26);
          } else if (n < 62) {
            return 48 + (n - 52);
          } else if (n == 62) {
            return 43;
          } else if (n == 63) {
            return 47;
          }
          throw "n:" + n;
        };
        _this.writeByte = function(n) {
          _buffer = _buffer << 8 | n & 255;
          _buflen += 8;
          _length += 1;
          while (_buflen >= 6) {
            writeEncoded(_buffer >>> _buflen - 6);
            _buflen -= 6;
          }
        };
        _this.flush = function() {
          if (_buflen > 0) {
            writeEncoded(_buffer << 6 - _buflen);
            _buffer = 0;
            _buflen = 0;
          }
          if (_length % 3 != 0) {
            var padlen = 3 - _length % 3;
            for (var i = 0; i < padlen; i += 1) {
              _base64 += "=";
            }
          }
        };
        _this.toString = function() {
          return _base64;
        };
        return _this;
      };
      var base64DecodeInputStream = function(str) {
        var _str = str;
        var _pos = 0;
        var _buffer = 0;
        var _buflen = 0;
        var _this = {};
        _this.read = function() {
          while (_buflen < 8) {
            if (_pos >= _str.length) {
              if (_buflen == 0) {
                return -1;
              }
              throw "unexpected end of file./" + _buflen;
            }
            var c = _str.charAt(_pos);
            _pos += 1;
            if (c == "=") {
              _buflen = 0;
              return -1;
            } else if (c.match(/^\s$/)) {
              continue;
            }
            _buffer = _buffer << 6 | decode(c.charCodeAt(0));
            _buflen += 6;
          }
          var n = _buffer >>> _buflen - 8 & 255;
          _buflen -= 8;
          return n;
        };
        var decode = function(c) {
          if (65 <= c && c <= 90) {
            return c - 65;
          } else if (97 <= c && c <= 122) {
            return c - 97 + 26;
          } else if (48 <= c && c <= 57) {
            return c - 48 + 52;
          } else if (c == 43) {
            return 62;
          } else if (c == 47) {
            return 63;
          } else {
            throw "c:" + c;
          }
        };
        return _this;
      };
      var gifImage = function(width, height) {
        var _width = width;
        var _height = height;
        var _data = new Array(width * height);
        var _this = {};
        _this.setPixel = function(x, y, pixel) {
          _data[y * _width + x] = pixel;
        };
        _this.write = function(out) {
          out.writeString("GIF87a");
          out.writeShort(_width);
          out.writeShort(_height);
          out.writeByte(128);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(255);
          out.writeByte(255);
          out.writeByte(255);
          out.writeString(",");
          out.writeShort(0);
          out.writeShort(0);
          out.writeShort(_width);
          out.writeShort(_height);
          out.writeByte(0);
          var lzwMinCodeSize = 2;
          var raster = getLZWRaster(lzwMinCodeSize);
          out.writeByte(lzwMinCodeSize);
          var offset = 0;
          while (raster.length - offset > 255) {
            out.writeByte(255);
            out.writeBytes(raster, offset, 255);
            offset += 255;
          }
          out.writeByte(raster.length - offset);
          out.writeBytes(raster, offset, raster.length - offset);
          out.writeByte(0);
          out.writeString(";");
        };
        var bitOutputStream = function(out) {
          var _out = out;
          var _bitLength = 0;
          var _bitBuffer = 0;
          var _this2 = {};
          _this2.write = function(data, length) {
            if (data >>> length != 0) {
              throw "length over";
            }
            while (_bitLength + length >= 8) {
              _out.writeByte(255 & (data << _bitLength | _bitBuffer));
              length -= 8 - _bitLength;
              data >>>= 8 - _bitLength;
              _bitBuffer = 0;
              _bitLength = 0;
            }
            _bitBuffer = data << _bitLength | _bitBuffer;
            _bitLength = _bitLength + length;
          };
          _this2.flush = function() {
            if (_bitLength > 0) {
              _out.writeByte(_bitBuffer);
            }
          };
          return _this2;
        };
        var getLZWRaster = function(lzwMinCodeSize) {
          var clearCode = 1 << lzwMinCodeSize;
          var endCode = (1 << lzwMinCodeSize) + 1;
          var bitLength = lzwMinCodeSize + 1;
          var table = lzwTable();
          for (var i = 0; i < clearCode; i += 1) {
            table.add(String.fromCharCode(i));
          }
          table.add(String.fromCharCode(clearCode));
          table.add(String.fromCharCode(endCode));
          var byteOut = byteArrayOutputStream();
          var bitOut = bitOutputStream(byteOut);
          bitOut.write(clearCode, bitLength);
          var dataIndex = 0;
          var s = String.fromCharCode(_data[dataIndex]);
          dataIndex += 1;
          while (dataIndex < _data.length) {
            var c = String.fromCharCode(_data[dataIndex]);
            dataIndex += 1;
            if (table.contains(s + c)) {
              s = s + c;
            } else {
              bitOut.write(table.indexOf(s), bitLength);
              if (table.size() < 4095) {
                if (table.size() == 1 << bitLength) {
                  bitLength += 1;
                }
                table.add(s + c);
              }
              s = c;
            }
          }
          bitOut.write(table.indexOf(s), bitLength);
          bitOut.write(endCode, bitLength);
          bitOut.flush();
          return byteOut.toByteArray();
        };
        var lzwTable = function() {
          var _map = {};
          var _size = 0;
          var _this2 = {};
          _this2.add = function(key) {
            if (_this2.contains(key)) {
              throw "dup key:" + key;
            }
            _map[key] = _size;
            _size += 1;
          };
          _this2.size = function() {
            return _size;
          };
          _this2.indexOf = function(key) {
            return _map[key];
          };
          _this2.contains = function(key) {
            return typeof _map[key] != "undefined";
          };
          return _this2;
        };
        return _this;
      };
      var createDataURL = function(width, height, getPixel) {
        var gif = gifImage(width, height);
        for (var y = 0; y < height; y += 1) {
          for (var x = 0; x < width; x += 1) {
            gif.setPixel(x, y, getPixel(x, y));
          }
        }
        var b = byteArrayOutputStream();
        gif.write(b);
        var base64 = base64EncodeOutputStream();
        var bytes = b.toByteArray();
        for (var i = 0; i < bytes.length; i += 1) {
          base64.writeByte(bytes[i]);
        }
        base64.flush();
        return "data:image/gif;base64," + base64;
      };
      return qrcode3;
    })();
    !(function() {
      qrcode2.stringToBytesFuncs["UTF-8"] = function(s) {
        function toUTF8Array(str) {
          var utf8 = [];
          for (var i = 0; i < str.length; i++) {
            var charcode = str.charCodeAt(i);
            if (charcode < 128) utf8.push(charcode);
            else if (charcode < 2048) {
              utf8.push(
                192 | charcode >> 6,
                128 | charcode & 63
              );
            } else if (charcode < 55296 || charcode >= 57344) {
              utf8.push(
                224 | charcode >> 12,
                128 | charcode >> 6 & 63,
                128 | charcode & 63
              );
            } else {
              i++;
              charcode = 65536 + ((charcode & 1023) << 10 | str.charCodeAt(i) & 1023);
              utf8.push(
                240 | charcode >> 18,
                128 | charcode >> 12 & 63,
                128 | charcode >> 6 & 63,
                128 | charcode & 63
              );
            }
          }
          return utf8;
        }
        return toUTF8Array(s);
      };
    })();
    (function(factory) {
      if (typeof define === "function" && define.amd) {
        define([], factory);
      } else if (typeof exports === "object") {
        module.exports = factory();
      }
    })(function() {
      return qrcode2;
    });
  }
});

// src/cli/qr-stream.ts
import { readFileSync as readFileSync2, existsSync as existsSync2, openSync, closeSync } from "fs";
import { ReadStream } from "tty";

// src/core/qr/qr_encode.ts
var import_qrcode_generator = __toESM(require_qrcode(), 1);
var RS_BLOCK_TABLE = [
  // V1
  [1, 26, 19],
  [1, 26, 16],
  [1, 26, 13],
  [1, 26, 9],
  // V2
  [1, 44, 34],
  [1, 44, 28],
  [1, 44, 22],
  [1, 44, 16],
  // V3
  [1, 70, 55],
  [1, 70, 44],
  [2, 35, 17],
  [2, 35, 13],
  // V4
  [1, 100, 80],
  [2, 50, 32],
  [2, 50, 24],
  [4, 25, 9],
  // V5
  [1, 134, 108],
  [2, 67, 43],
  [2, 33, 15, 2, 34, 16],
  [2, 33, 11, 2, 34, 12],
  // V6
  [2, 86, 68],
  [4, 43, 27],
  [4, 43, 19],
  [4, 43, 15],
  // V7
  [2, 98, 78],
  [4, 49, 31],
  [2, 32, 14, 4, 33, 15],
  [4, 39, 13, 1, 40, 14],
  // V8
  [2, 121, 97],
  [2, 60, 38, 2, 61, 39],
  [4, 40, 18, 2, 41, 19],
  [4, 40, 14, 2, 41, 15],
  // V9
  [2, 146, 116],
  [3, 58, 36, 2, 59, 37],
  [4, 36, 16, 4, 37, 17],
  [4, 36, 12, 4, 37, 13],
  // V10
  [2, 86, 68, 2, 87, 69],
  [4, 69, 43, 1, 70, 44],
  [6, 43, 19, 2, 44, 20],
  [6, 43, 15, 2, 44, 16],
  // V11
  [4, 101, 81],
  [1, 80, 50, 4, 81, 51],
  [4, 50, 22, 4, 51, 23],
  [3, 36, 12, 8, 37, 13],
  // V12
  [2, 116, 92, 2, 117, 93],
  [6, 58, 36, 2, 59, 37],
  [4, 46, 20, 6, 47, 21],
  [7, 42, 14, 4, 43, 15],
  // V13
  [4, 133, 107],
  [8, 59, 37, 1, 60, 38],
  [8, 44, 20, 4, 45, 21],
  [12, 33, 11, 4, 34, 12],
  // V14
  [3, 145, 115, 1, 146, 116],
  [4, 64, 40, 5, 65, 41],
  [11, 36, 16, 5, 37, 17],
  [11, 36, 12, 5, 37, 13],
  // V15
  [5, 109, 87, 1, 110, 88],
  [5, 65, 41, 5, 66, 42],
  [5, 54, 24, 7, 55, 25],
  [11, 36, 12, 7, 37, 13],
  // V16
  [5, 122, 98, 1, 123, 99],
  [7, 73, 45, 3, 74, 46],
  [15, 43, 19, 2, 44, 20],
  [3, 45, 15, 13, 46, 16],
  // V17
  [1, 135, 107, 5, 136, 108],
  [10, 74, 46, 1, 75, 47],
  [1, 50, 22, 15, 51, 23],
  [2, 42, 14, 17, 43, 15],
  // V18
  [5, 150, 120, 1, 151, 121],
  [9, 69, 43, 4, 70, 44],
  [17, 50, 22, 1, 51, 23],
  [2, 42, 14, 19, 43, 15],
  // V19
  [3, 141, 113, 4, 142, 114],
  [3, 70, 44, 11, 71, 45],
  [17, 47, 21, 4, 48, 22],
  [9, 39, 13, 16, 40, 14],
  // V20
  [3, 135, 107, 5, 136, 108],
  [3, 67, 41, 13, 68, 42],
  [15, 54, 24, 5, 55, 25],
  [15, 43, 15, 10, 44, 16],
  // V21
  [4, 144, 116, 4, 145, 117],
  [17, 68, 42],
  [17, 50, 22, 6, 51, 23],
  [19, 46, 16, 6, 47, 17],
  // V22
  [2, 139, 111, 7, 140, 112],
  [17, 74, 46],
  [7, 54, 24, 16, 55, 25],
  [34, 37, 13],
  // V23
  [4, 151, 121, 5, 152, 122],
  [4, 75, 47, 14, 76, 48],
  [11, 54, 24, 14, 55, 25],
  [16, 45, 15, 14, 46, 16],
  // V24
  [6, 147, 117, 4, 148, 118],
  [6, 73, 45, 14, 74, 46],
  [11, 54, 24, 16, 55, 25],
  [30, 46, 16, 2, 47, 17],
  // V25
  [8, 132, 106, 4, 133, 107],
  [8, 75, 47, 13, 76, 48],
  [7, 54, 24, 22, 55, 25],
  [22, 45, 15, 13, 46, 16],
  // V26
  [10, 142, 114, 2, 143, 115],
  [19, 74, 46, 4, 75, 47],
  [28, 50, 22, 6, 51, 23],
  [33, 46, 16, 4, 47, 17],
  // V27
  [8, 152, 122, 4, 153, 123],
  [22, 73, 45, 3, 74, 46],
  [8, 53, 23, 26, 54, 24],
  [12, 45, 15, 28, 46, 16],
  // V28
  [3, 147, 117, 10, 148, 118],
  [3, 73, 45, 23, 74, 46],
  [4, 54, 24, 31, 55, 25],
  [11, 45, 15, 31, 46, 16],
  // V29
  [7, 146, 116, 7, 147, 117],
  [21, 73, 45, 7, 74, 46],
  [1, 53, 23, 37, 54, 24],
  [19, 45, 15, 26, 46, 16],
  // V30
  [5, 145, 115, 10, 146, 116],
  [19, 75, 47, 10, 76, 48],
  [15, 54, 24, 25, 55, 25],
  [23, 45, 15, 25, 46, 16],
  // V31
  [13, 145, 115, 3, 146, 116],
  [2, 74, 46, 29, 75, 47],
  [42, 54, 24, 1, 55, 25],
  [23, 45, 15, 28, 46, 16],
  // V32
  [17, 145, 115],
  [10, 74, 46, 23, 75, 47],
  [10, 54, 24, 35, 55, 25],
  [19, 45, 15, 35, 46, 16],
  // V33
  [17, 145, 115, 1, 146, 116],
  [14, 74, 46, 21, 75, 47],
  [29, 54, 24, 19, 55, 25],
  [11, 45, 15, 46, 46, 16],
  // V34
  [13, 145, 115, 6, 146, 116],
  [14, 74, 46, 23, 75, 47],
  [44, 54, 24, 7, 55, 25],
  [59, 46, 16, 1, 47, 17],
  // V35
  [12, 151, 121, 7, 152, 122],
  [12, 75, 47, 26, 76, 48],
  [39, 54, 24, 14, 55, 25],
  [22, 45, 15, 41, 46, 16],
  // V36
  [6, 151, 121, 14, 152, 122],
  [6, 75, 47, 34, 76, 48],
  [46, 54, 24, 10, 55, 25],
  [2, 45, 15, 64, 46, 16],
  // V37
  [17, 152, 122, 4, 153, 123],
  [29, 74, 46, 14, 75, 47],
  [49, 54, 24, 10, 55, 25],
  [24, 45, 15, 46, 46, 16],
  // V38
  [4, 152, 122, 18, 153, 123],
  [13, 74, 46, 32, 75, 47],
  [48, 54, 24, 14, 55, 25],
  [42, 45, 15, 32, 46, 16],
  // V39
  [20, 147, 117, 4, 148, 118],
  [40, 75, 47, 7, 76, 48],
  [43, 54, 24, 22, 55, 25],
  [10, 45, 15, 67, 46, 16],
  // V40
  [19, 148, 118, 6, 149, 119],
  [18, 75, 47, 31, 76, 48],
  [34, 54, 24, 34, 55, 25],
  [20, 45, 15, 61, 46, 16]
];
var ECC_INDEX = { L: 0, M: 1, Q: 2, H: 3 };
function getMaxByteCapacity(version, eccLevel) {
  const idx = (version - 1) * 4 + ECC_INDEX[eccLevel];
  const entry = RS_BLOCK_TABLE[idx];
  if (!entry) {
    throw new Error(`No RS block table entry for V${version}-${eccLevel}`);
  }
  let totalDataCodewords = 0;
  for (let i = 0; i < entry.length; i += 3) {
    totalDataCodewords += entry[i] * entry[i + 2];
  }
  const charCountBits = version <= 9 ? 8 : 16;
  const overheadBits = 4 + charCountBits;
  return Math.floor((totalDataCodewords * 8 - overheadBits) / 8);
}
function getMinVersion(dataLength, eccLevel) {
  for (let v = 1; v <= 40; v++) {
    if (dataLength <= getMaxByteCapacity(v, eccLevel)) {
      return v;
    }
  }
  throw new Error(
    `Data too large (${dataLength} bytes) for any QR version at ECC level ${eccLevel}.`
  );
}
function generateQRMatrix(data, version, eccLevel) {
  if (version < 1 || version > 40) {
    throw new Error(`Invalid QR version: ${version}. Must be 1-40.`);
  }
  const maxBytes = getMaxByteCapacity(version, eccLevel);
  if (data.length > maxBytes) {
    const minVer = getMinVersion(data.length, eccLevel);
    throw new Error(
      `Data too large for V${version}-${eccLevel}. Maximum ${maxBytes} data bytes in byte mode, got ${data.length}. Minimum required version: V${minVer}.`
    );
  }
  const dataStr = String.fromCharCode(...data);
  const qr = (0, import_qrcode_generator.default)(version, eccLevel);
  qr.addData(dataStr, "Byte");
  qr.make();
  const moduleCount = qr.getModuleCount();
  const matrix = [];
  for (let row = 0; row < moduleCount; row++) {
    const rowArr = [];
    for (let col = 0; col < moduleCount; col++) {
      rowArr.push(qr.isDark(row, col));
    }
    matrix.push(rowArr);
  }
  return matrix;
}

// src/core/protocol/constants.ts
var MAGIC_BYTE = 81;
var HEADER_SIZE = 8;
var CRC32C_SIZE = 4;
var PACKET_OVERHEAD = HEADER_SIZE + CRC32C_SIZE;
var MAX_PAYLOAD_SIZE = 201;
var K = 16;
var R = 8;
var QR_VERSION = 10;
var ECC_LEVEL = "M";
var OUTER_EC_OVERHEAD = 0.03;
function parityCount(sourceGenerations) {
  return Math.floor(sourceGenerations * OUTER_EC_OVERHEAD);
}

// src/core/protocol/crc32c.ts
var TABLE = new Uint32Array(256);
var tableBuilt = false;
function buildTable() {
  const poly = 2197175160 >>> 0;
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = crc >>> 1 ^ poly;
      } else {
        crc >>>= 1;
      }
    }
    TABLE[i] = crc >>> 0;
  }
  tableBuilt = true;
}
function ensureTable() {
  if (!tableBuilt) {
    buildTable();
  }
}
function crc32c(data, initial = 0) {
  ensureTable();
  let crc = (initial ^ 4294967295) >>> 0;
  const len = data.length;
  for (let i = 0; i < len; i++) {
    const idx = (crc ^ data[i]) & 255;
    crc = (TABLE[idx] ^ crc >>> 8) >>> 0;
  }
  return (crc ^ 4294967295) >>> 0;
}

// src/core/protocol/packet.ts
function writeUint24LE(data, offset, value) {
  data[offset] = value & 255;
  data[offset + 1] = value >>> 8 & 255;
  data[offset + 2] = value >>> 16 & 255;
}
function readUint24LE(data, offset) {
  return (data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16) >>> 0;
}
function writeUint32LE(data, offset, value) {
  data[offset] = value & 255;
  data[offset + 1] = value >>> 8 & 255;
  data[offset + 2] = value >>> 16 & 255;
  data[offset + 3] = value >>> 24 & 255;
}
function readUint32LE(data, offset) {
  return (data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24 >>> 0) >>> 0;
}
function packWord(generationIndex, totalGenerations, symbolIndex, isText, isLastGeneration, compressed) {
  let word = 0;
  word |= generationIndex & 4095;
  word |= (totalGenerations & 4095) << 12;
  word |= (symbolIndex & 31) << 24;
  word |= (isText ? 1 : 0) << 29;
  word |= (isLastGeneration ? 1 : 0) << 30;
  word |= (compressed ? 1 : 0) << 31;
  return word >>> 0;
}
function unpackWord(word) {
  const w = word >>> 0;
  return {
    generationIndex: w & 4095,
    totalGenerations: w >>> 12 & 4095,
    symbolIndex: w >>> 24 & 31,
    isText: (w >>> 29 & 1) !== 0,
    isLastGeneration: (w >>> 30 & 1) !== 0,
    compressed: (w >>> 31 & 1) !== 0
  };
}
function serializeHeader(header) {
  const buf = new Uint8Array(HEADER_SIZE);
  buf[0] = MAGIC_BYTE;
  const word = packWord(
    header.generationIndex,
    header.totalGenerations,
    header.symbolIndex,
    header.isText,
    header.isLastGeneration,
    header.compressed
  );
  writeUint32LE(buf, 1, word);
  writeUint24LE(buf, 5, header.dataLength);
  return buf;
}
function parseHeader(data) {
  if (data.length < HEADER_SIZE) {
    throw new Error(
      `Packet too short for header: ${data.length} bytes, need ${HEADER_SIZE}`
    );
  }
  if (data[0] !== MAGIC_BYTE) {
    throw new Error(
      `Invalid magic byte: expected 0x51, got 0x${data[0].toString(16)}`
    );
  }
  const unpacked = unpackWord(readUint32LE(data, 1));
  return {
    ...unpacked,
    dataLength: readUint24LE(data, 5)
  };
}
function createPacket(header, payload) {
  const headerBytes = serializeHeader(header);
  const totalLen = HEADER_SIZE + payload.length + CRC32C_SIZE;
  const packet = new Uint8Array(totalLen);
  packet.set(headerBytes, 0);
  packet.set(payload, HEADER_SIZE);
  const crcInput = new Uint8Array(HEADER_SIZE + payload.length);
  crcInput.set(headerBytes, 0);
  crcInput.set(payload, HEADER_SIZE);
  writeUint32LE(packet, HEADER_SIZE + payload.length, crc32c(crcInput));
  return packet;
}

// src/core/fec/gf256.ts
var GF_SIZE = 256;
var GF_TABLE_SIZE = 512;
var IRREDUCIBLE_POLY = 285;
var logTable = new Uint8Array(GF_SIZE);
var expTable = new Uint8Array(GF_TABLE_SIZE);
function initTables() {
  let x = 1;
  for (let i = 0; i < GF_SIZE - 1; i++) {
    expTable[i] = x;
    logTable[x] = i;
    x = x << 1;
    if (x >= GF_SIZE) {
      x ^= IRREDUCIBLE_POLY;
    }
  }
  for (let i = GF_SIZE - 1; i < GF_TABLE_SIZE; i++) {
    expTable[i] = expTable[i - (GF_SIZE - 1)];
  }
  logTable[0] = 0;
}
initTables();
function add(a, b) {
  return (a ^ b) >>> 0;
}
function sub(a, b) {
  return add(a, b);
}
function mul(a, b) {
  if (a === 0 || b === 0) {
    return 0;
  }
  const sum = logTable[a] + logTable[b];
  return expTable[sum];
}
function div(a, b) {
  if (b === 0) {
    throw new RangeError("GF(256) division by zero");
  }
  if (a === 0) {
    return 0;
  }
  const diff = (logTable[a] - logTable[b] + 255) % 255;
  return expTable[diff];
}
function pow(a, n) {
  if (n === 0) {
    return 1;
  }
  if (a === 0) {
    return 0;
  }
  const idx = logTable[a] * n % 255;
  return expTable[idx];
}

// src/core/fec/xoshiro.ts
var Xoshiro128 = class {
  s;
  /**
   * Create a new xoshiro128** instance from a 32-bit seed.
   * The seed is expanded to a 128-bit state using splitmix64.
   *
   * @param seed - 32-bit integer seed
   */
  constructor(seed) {
    const s = (seed >>> 0 | 0) >>> 0;
    this.s = new Uint32Array(4);
    let state = BigInt(s);
    for (let i = 0; i < 4; i++) {
      state = splitmix64Next(state);
      this.s[i] = Number(state & BigInt(4294967295)) >>> 0;
    }
  }
  /**
   * Generate the next 32-bit unsigned integer.
   * Uses the xoshiro128** algorithm.
   *
   * @returns A pseudo-random 32-bit unsigned integer (0..2^32-1)
   */
  next() {
    const result = xoshiro128StarStar(this.s);
    const t = this.s[1] << 9;
    this.s[2] ^= this.s[0];
    this.s[3] ^= this.s[1];
    this.s[1] ^= this.s[2];
    this.s[0] ^= this.s[3];
    this.s[2] ^= t;
    this.s[3] = rotl(this.s[3], 11);
    return result >>> 0;
  }
  /**
   * Get a random byte (0..255) from the current state.
   */
  nextByte() {
    return this.next() & 255;
  }
};
function splitmix64Next(state) {
  state = state + BigInt(114007148193232e5) & BigInt("0xffffffffffffffff");
  let z = state;
  z = (z ^ z >> 30n) * BigInt(13787848793156545e3);
  z = (z ^ z >> 27n) & BigInt("0xffffffffffffffff");
  z = z * BigInt(10723151780598845e3) & BigInt("0xffffffffffffffff");
  z = z ^ z >> 31n;
  return z & BigInt("0xffffffffffffffff");
}
function xoshiro128StarStar(s) {
  const result = Math.imul(
    rotl(Math.imul(s[1] >>> 0, 5) >>> 0, 7) >>> 0,
    9
  ) >>> 0;
  return result;
}
function rotl(x, k) {
  return (x << k | x >>> 32 - k) >>> 0;
}

// src/core/fec/rlnc_encoder.ts
function deriveCoefficientSeed(generationIndex, codedSymbolIndex) {
  const gen = generationIndex >>> 0;
  const idx = codedSymbolIndex + 1 >>> 0;
  return (gen * 2654435769 ^ idx * 2246822507 ^ gen >>> 16 ^ idx << 16) >>> 0;
}
function generateCoefficients(k, seed) {
  const rng = new Xoshiro128(seed);
  const coeffs = new Uint8Array(k);
  let allZero = true;
  let attempts = 0;
  const MAX_ATTEMPTS = 100;
  do {
    allZero = false;
    for (let i = 0; i < k; i++) {
      let v;
      do {
        v = rng.nextByte();
      } while (v === 0);
      coeffs[i] = v;
    }
    allZero = true;
    for (let i = 0; i < k; i++) {
      if (coeffs[i] !== 0) {
        allZero = false;
        break;
      }
    }
    attempts++;
    if (attempts >= MAX_ATTEMPTS) {
      coeffs[0] = 1;
      allZero = false;
    }
  } while (allZero);
  return coeffs;
}
function encodeGeneration(sourceSymbols, k, r, generationIndex) {
  if (sourceSymbols.length !== k) {
    throw new RangeError(
      `encodeGeneration: expected ${k} source symbols, got ${sourceSymbols.length}`
    );
  }
  if (k === 0) {
    return [];
  }
  const symbolLength = sourceSymbols[0].length;
  for (let i = 1; i < k; i++) {
    if (sourceSymbols[i].length !== symbolLength) {
      throw new RangeError(
        `encodeGeneration: symbol at index ${i} has length ${sourceSymbols[i].length}, expected ${symbolLength}`
      );
    }
  }
  const results = [];
  for (let i = 0; i < k; i++) {
    const coeffs = new Uint8Array(k);
    coeffs[i] = 1;
    results.push({
      coefficients: coeffs,
      data: new Uint8Array(sourceSymbols[i]),
      isSystematic: true,
      sourceIndex: i
    });
  }
  for (let j = 0; j < r; j++) {
    const symbolSeed = deriveCoefficientSeed(generationIndex, j);
    const coeffs = generateCoefficients(k, symbolSeed);
    const codedData = new Uint8Array(symbolLength);
    for (let i = 0; i < k; i++) {
      const coeff = coeffs[i];
      if (coeff === 0) continue;
      const src = sourceSymbols[i];
      for (let b = 0; b < symbolLength; b++) {
        codedData[b] ^= mul(coeff, src[b]);
      }
    }
    results.push({
      coefficients: coeffs,
      data: codedData,
      isSystematic: false,
      sourceIndex: -1
    });
  }
  return results;
}

// src/core/fec/outer_rs.ts
var PRIMITIVE = 2;
function fastEvalPoint(i) {
  return pow(PRIMITIVE, i % 255);
}
function lagrangeCoeff(i, z, sourcePoints) {
  let num = 1;
  let den = 1;
  const xi = sourcePoints[i];
  for (let j = 0; j < sourcePoints.length; j++) {
    if (j === i) continue;
    const xj = sourcePoints[j];
    num = mul(num, sub(z, xj));
    den = mul(den, sub(xi, xj));
  }
  return div(num, den);
}
function encodeOuterRS(sourceChunks, parityCount2) {
  const G = sourceChunks.length;
  const P = parityCount2;
  if (P === 0 || G === 0) return [];
  const symbolSize = sourceChunks[0].length;
  const sourcePoints = Array.from({ length: G }, (_, i) => fastEvalPoint(i));
  const parityPoints = Array.from({ length: P }, (_, p) => fastEvalPoint(G + p));
  const lagrangeCoeffs = [];
  for (let p = 0; p < P; p++) {
    const row = [];
    for (let i = 0; i < G; i++) {
      row.push(lagrangeCoeff(i, parityPoints[p], sourcePoints));
    }
    lagrangeCoeffs.push(row);
  }
  const parityChunks = [];
  for (let p = 0; p < P; p++) {
    const chunk = new Uint8Array(symbolSize);
    const coeffs = lagrangeCoeffs[p];
    for (let b = 0; b < symbolSize; b++) {
      let sum = 0;
      for (let g = 0; g < G; g++) {
        const c = coeffs[g];
        const s = sourceChunks[g][b];
        if (c === 0 || s === 0) continue;
        sum = add(sum, mul(c, s));
      }
      chunk[b] = sum;
    }
    parityChunks.push(chunk);
  }
  return parityChunks;
}

// node_modules/fflate/esm/index.mjs
import { createRequire } from "module";
var require2 = createRequire("/");
var Worker;
try {
  Worker = require2("worker_threads").Worker;
} catch (e) {
}
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flm = /* @__PURE__ */ hMap(flt, 9, 0);
var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var wbits = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
};
var wbits16 = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
  d[o + 2] |= v >> 16;
};
var hTree = function(d, mb) {
  var t = [];
  for (var i = 0; i < d.length; ++i) {
    if (d[i])
      t.push({ s: i, f: d[i] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s)
    return { t: et, l: 0 };
  if (s == 1) {
    var v = new u8(t[0].s + 1);
    v[t[0].s] = 1;
    return { t: v, l: 1 };
  }
  t.sort(function(a, b) {
    return a.f - b.f;
  });
  t.push({ s: -1, f: 25001 });
  var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
  t[0] = { s: -1, f: l.f + r.f, l, r };
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i2].f ? i0++ : i2++];
    r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
    t[i1++] = { s: -1, f: l.f + r.f, l, r };
  }
  var maxSym = t2[0].s;
  for (var i = 1; i < s; ++i) {
    if (t2[i].s > maxSym)
      maxSym = t2[i].s;
  }
  var tr = new u16(maxSym + 1);
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    var i = 0, dt = 0;
    var lft = mbt - mb, cst = 1 << lft;
    t2.sort(function(a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (; i < s; ++i) {
      var i2_1 = t2[i].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << mbt - tr[i2_1]);
        tr[i2_1] = mb;
      } else
        break;
    }
    dt >>= lft;
    while (dt > 0) {
      var i2_2 = t2[i].s;
      if (tr[i2_2] < mb)
        dt -= 1 << mb - tr[i2_2]++ - 1;
      else
        ++i;
    }
    for (; i >= 0 && dt; --i) {
      var i2_3 = t2[i].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return { t: new u8(tr), l: mbt };
};
var ln = function(n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
  var s = c.length;
  while (s && !c[--s])
    ;
  var cl = new u16(++s);
  var cli = 0, cln = c[0], cls = 1;
  var w = function(v) {
    cl[cli++] = v;
  };
  for (var i = 1; i <= s; ++i) {
    if (c[i] == cln && i != s)
      ++cls;
    else {
      if (!cln && cls > 2) {
        for (; cls > 138; cls -= 138)
          w(32754);
        if (cls > 2) {
          w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        w(cln), --cls;
        for (; cls > 6; cls -= 6)
          w(8304);
        if (cls > 2)
          w(cls - 3 << 5 | 8208), cls = 0;
      }
      while (cls--)
        w(cln);
      cls = 1;
      cln = c[i];
    }
  }
  return { c: cl.subarray(0, cli), n: s };
};
var clen = function(cf, cl) {
  var l = 0;
  for (var i = 0; i < cl.length; ++i)
    l += cf[i] * cl[i];
  return l;
};
var wfblk = function(out, pos, dat) {
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i = 0; i < s; ++i)
    out[o + i + 4] = dat[i];
  return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
  var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
  var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
  var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
  var lcfreq = new u16(19);
  for (var i = 0; i < lclt.length; ++i)
    ++lcfreq[lclt[i] & 31];
  for (var i = 0; i < lcdt.length; ++i)
    ++lcfreq[lcdt[i] & 31];
  var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
  var nlcc = 19;
  for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
    ;
  var flen = bl + 5 << 3;
  var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
  var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
  if (bs >= 0 && flen <= ftlen && flen <= dtlen)
    return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm, ll, dm, dl;
  wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
  if (dtlen < ftlen) {
    lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i = 0; i < nlcc; ++i)
      wbits(out, p + 3 * i, lct[clim[i]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0; it < 2; ++it) {
      var clct = lcts[it];
      for (var i = 0; i < clct.length; ++i) {
        var len = clct[i] & 31;
        wbits(out, p, llm[len]), p += lct[len];
        if (len > 15)
          wbits(out, p, clct[i] >> 5 & 127), p += clct[i] >> 12;
      }
    }
  } else {
    lm = flm, ll = flt, dm = fdm, dl = fdt;
  }
  for (var i = 0; i < li; ++i) {
    var sym = syms[i];
    if (sym > 255) {
      var len = sym >> 18 & 31;
      wbits16(out, p, lm[len + 257]), p += ll[len + 257];
      if (len > 7)
        wbits(out, p, sym >> 23 & 31), p += fleb[len];
      var dst = sym & 31;
      wbits16(out, p, dm[dst]), p += dl[dst];
      if (dst > 3)
        wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
    } else {
      wbits16(out, p, lm[sym]), p += ll[sym];
    }
  }
  wbits16(out, p, lm[256]);
  return p + ll[256];
};
var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var et = /* @__PURE__ */ new u8(0);
var dflt = function(dat, lvl, plvl, pre, post, st) {
  var s = st.z || dat.length;
  var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
  var w = o.subarray(pre, o.length - post);
  var lst = st.l;
  var pos = (st.r || 0) & 7;
  if (lvl) {
    if (pos)
      w[0] = st.r >> 3;
    var opt = deo[lvl - 1];
    var n = opt >> 13, c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
    var hsh = function(i2) {
      return (dat[i2] ^ dat[i2 + 1] << bs1_1 ^ dat[i2 + 2] << bs2_1) & msk_1;
    };
    var syms = new i32(25e3);
    var lf = new u16(288), df = new u16(32);
    var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
    for (; i + 2 < s; ++i) {
      var hv = hsh(i);
      var imod = i & 32767, pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      if (wi <= i) {
        var rem = s - i;
        if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
          li = lc_1 = eb = 0, bs = i;
          for (var j = 0; j < 286; ++j)
            lf[j] = 0;
          for (var j = 0; j < 30; ++j)
            df[j] = 0;
        }
        var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
        if (rem > 2 && hv == hsh(i - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i);
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i + l] == dat[i + l - dif]) {
              var nl = 0;
              for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                ;
              if (nl > l) {
                l = nl, d = dif;
                if (nl > maxn)
                  break;
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0; j < mmd; ++j) {
                  var ti = i - dif + j & 32767;
                  var pti = prev[ti];
                  var cd = ti - pti & 32767;
                  if (cd > md)
                    md = cd, pimod = ti;
                }
              }
            }
            imod = pimod, pimod = prev[imod];
            dif += imod - pimod & 32767;
          }
        }
        if (d) {
          syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
          var lin = revfl[l] & 31, din = revfd[d] & 31;
          eb += fleb[lin] + fdeb[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i];
          ++lf[dat[i]];
        }
      }
    }
    for (i = Math.max(i, wi); i < s; ++i) {
      syms[li++] = dat[i];
      ++lf[dat[i]];
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
    if (!lst) {
      st.r = pos & 7 | w[pos / 8 | 0] << 3;
      pos -= 7;
      st.h = head, st.p = prev, st.i = i, st.w = wi;
    }
  } else {
    for (var i = st.w || 0; i < s + lst; i += 65535) {
      var e = i + 65535;
      if (e >= s) {
        w[pos / 8 | 0] = lst;
        e = s;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i, e));
    }
    st.i = s;
  }
  return slc(o, 0, pre + shft(pos) + post);
};
var dopt = function(dat, opt, pre, post, st) {
  if (!st) {
    st = { l: 1 };
    if (opt.dictionary) {
      var dict = opt.dictionary.subarray(-32768);
      var newDat = new u8(dict.length + dat.length);
      newDat.set(dict);
      newDat.set(dat, dict.length);
      dat = newDat;
      st.w = dict.length;
    }
  }
  return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
};
function deflateSync(data, opts) {
  return dopt(data, opts || {}, 0, 0);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}

// src/core/sender/packetizer.ts
function packetize(data, isText, compress, filename, mimeType) {
  let wrapped;
  if (!isText && filename) {
    const nameBytes = new TextEncoder().encode(filename);
    const mimeBytes = new TextEncoder().encode(mimeType || "application/octet-stream");
    const nameLen = Math.min(nameBytes.length, 255);
    const mimeLen = Math.min(mimeBytes.length, 255);
    wrapped = new Uint8Array(2 + nameLen + mimeLen + data.length);
    let off = 0;
    wrapped[off++] = nameLen;
    wrapped.set(nameBytes.slice(0, nameLen), off);
    off += nameLen;
    wrapped[off++] = mimeLen;
    wrapped.set(mimeBytes.slice(0, mimeLen), off);
    off += mimeLen;
    wrapped.set(data, off);
  } else {
    wrapped = new Uint8Array(data);
  }
  let preprocessed;
  let isCompressed;
  if (compress && wrapped.length > 64) {
    preprocessed = deflateSync(wrapped);
    isCompressed = true;
  } else {
    preprocessed = new Uint8Array(wrapped);
    isCompressed = false;
  }
  const dataLength = preprocessed.length;
  const symbols = [];
  for (let offset = 0; offset < dataLength; offset += MAX_PAYLOAD_SIZE) {
    const chunk = preprocessed.slice(offset, offset + MAX_PAYLOAD_SIZE);
    if (chunk.length < MAX_PAYLOAD_SIZE) {
      const padded = new Uint8Array(MAX_PAYLOAD_SIZE);
      padded.set(chunk);
      symbols.push(padded);
    } else {
      symbols.push(chunk);
    }
  }
  const totalSymbols = symbols.length;
  const sourceGenerations = Math.max(1, Math.ceil(totalSymbols / K));
  const P = parityCount(sourceGenerations);
  const totalGenerations = sourceGenerations + P;
  const sourceChunks = [];
  for (let gen = 0; gen < sourceGenerations; gen++) {
    const startIdx = gen * K;
    const genSymbolsCount = Math.min(K, totalSymbols - startIdx);
    const chunk = new Uint8Array(K * MAX_PAYLOAD_SIZE);
    for (let i = 0; i < K; i++) {
      if (i < genSymbolsCount) {
        chunk.set(symbols[startIdx + i], i * MAX_PAYLOAD_SIZE);
      }
    }
    sourceChunks.push(chunk);
  }
  const parityChunks = encodeOuterRS(sourceChunks, P);
  const packets = [];
  const allChunks = [...sourceChunks, ...parityChunks];
  for (let gen = 0; gen < allChunks.length; gen++) {
    const chunk = allChunks[gen];
    const isSourceGen = gen < sourceGenerations;
    const isLastSourceGen = gen === sourceGenerations - 1;
    const isLastGen = gen === allChunks.length - 1;
    const genSymbols = [];
    for (let i = 0; i < K; i++) {
      genSymbols.push(chunk.slice(i * MAX_PAYLOAD_SIZE, (i + 1) * MAX_PAYLOAD_SIZE));
    }
    const codedSymbols = encodeGeneration(genSymbols, K, R, gen);
    for (let i = 0; i < K; i++) {
      const cs = codedSymbols[i];
      const header = {
        generationIndex: gen,
        totalGenerations,
        symbolIndex: cs.sourceIndex,
        isText,
        isLastGeneration: isLastGen,
        compressed: isCompressed,
        dataLength
      };
      packets.push(createPacket(header, cs.data));
    }
    for (let j = 0; j < R; j++) {
      const cs = codedSymbols[K + j];
      const header = {
        generationIndex: gen,
        totalGenerations,
        symbolIndex: 16 + j,
        isText,
        isLastGeneration: isLastGen,
        compressed: isCompressed,
        dataLength
      };
      packets.push(createPacket(header, cs.data));
    }
  }
  return {
    packets,
    totalGenerations,
    sourceGenerations,
    dataLength,
    isText,
    isCompressed
  };
}

// src/core/sender/scheduler.ts
function seededShuffle(arr, seed) {
  const rng = new Xoshiro128(seed);
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.next() % (i + 1);
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}
function scheduleFrames(packets, totalGenerations) {
  const byGenAndSymbol = /* @__PURE__ */ new Map();
  for (const pkt of packets) {
    const header = parseHeader(pkt);
    let genMap = byGenAndSymbol.get(header.generationIndex);
    if (!genMap) {
      genMap = /* @__PURE__ */ new Map();
      byGenAndSymbol.set(header.generationIndex, genMap);
    }
    genMap.set(header.symbolIndex, pkt);
  }
  const genIndices = [];
  for (let i = 0; i < totalGenerations; i++) genIndices.push(i);
  const permutedGens = seededShuffle(genIndices, totalGenerations);
  const frames = [];
  for (let symIdx = 0; symIdx < K; symIdx++) {
    for (const genIdx of permutedGens) {
      const genMap = byGenAndSymbol.get(genIdx);
      const pkt = genMap?.get(symIdx);
      if (pkt) frames.push(pkt);
    }
  }
  for (let symIdx = K; symIdx < K + R; symIdx++) {
    for (const genIdx of permutedGens) {
      const genMap = byGenAndSymbol.get(genIdx);
      const pkt = genMap?.get(symIdx);
      if (pkt) frames.push(pkt);
    }
  }
  return frames;
}

// src/cli/terminal_raster.ts
var BLOCK_FULL = "\u2588";
var BLOCK_UPPER = "\u2580";
var BLOCK_LOWER = "\u2584";
var BLOCK_EMPTY = " ";
var QR_LINE_PREFIX = "\x1B[47m\x1B[30m";
var QR_LINE_SUFFIX = "\x1B[0m";
function renderToTerminal(matrix, quietZone = 4) {
  const size = matrix.length;
  const totalWidth = size + quietZone * 2;
  const lines = [];
  const padRows = Math.ceil(quietZone / 2);
  for (let i = 0; i < padRows; i++) {
    lines.push(QR_LINE_PREFIX + " ".repeat(totalWidth) + QR_LINE_SUFFIX);
  }
  for (let y = 0; y < size; y += 2) {
    let line = " ".repeat(quietZone);
    for (let x = 0; x < size; x++) {
      const top = matrix[y][x];
      const bottom = y + 1 < size ? matrix[y + 1][x] : false;
      if (top && bottom) {
        line += BLOCK_FULL;
      } else if (top) {
        line += BLOCK_UPPER;
      } else if (bottom) {
        line += BLOCK_LOWER;
      } else {
        line += BLOCK_EMPTY;
      }
    }
    line += " ".repeat(quietZone);
    lines.push(QR_LINE_PREFIX + line + QR_LINE_SUFFIX);
  }
  for (let i = 0; i < padRows; i++) {
    lines.push(QR_LINE_PREFIX + " ".repeat(totalWidth) + QR_LINE_SUFFIX);
  }
  return lines;
}
function enterAltBuffer() {
  process.stdout.write("\x1B[?1049h");
}
function exitAltBuffer() {
  process.stdout.write("\x1B[?1049l");
}
function clearScreen() {
  process.stdout.write("\x1B[2J\x1B[H");
}
function hideCursor() {
  process.stdout.write("\x1B[?25l");
}
function moveCursorUp(n) {
  if (n > 0) {
    process.stdout.write(`\x1B[${n}A`);
  }
  process.stdout.write("\x1B[G");
}
function showCursor() {
  process.stdout.write("\x1B[?25h");
}

// src/cli/static_server.ts
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { extname, join, dirname, basename } from "path";
import { fileURLToPath } from "url";
var MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm"
};
function findWebRoot() {
  const scriptPath = fileURLToPath(import.meta.url);
  let dir = dirname(scriptPath);
  if (basename(dir) === "dist") {
    return dir;
  }
  while (dir !== dirname(dir)) {
    const candidate = join(dir, "dist");
    if (existsSync(join(candidate, "index.html"))) {
      return candidate;
    }
    dir = dirname(dir);
  }
  throw new Error(
    "Could not find built web assets (dist/index.html). Run `npm run build` first."
  );
}
function startServer(port, host) {
  const root = findWebRoot();
  const server = createServer((req, res) => {
    let pathname = req.url ?? "/";
    const qIdx = pathname.indexOf("?");
    if (qIdx !== -1) pathname = pathname.slice(0, qIdx);
    const safePath = pathname.replace(/\.{2,}/g, "");
    let filePath = join(root, safePath);
    if (!existsSync(filePath) || !filePath.startsWith(root)) {
      const ext2 = extname(safePath);
      if (!ext2 || ext2 === ".html") {
        filePath = join(root, "index.html");
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }
    }
    if (statSync(filePath).isDirectory()) {
      filePath = join(filePath, "index.html");
    }
    if (!existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": content.length
    });
    res.end(content);
  });
  server.listen(port, host ?? "0.0.0.0", () => {
    const addr = host ?? "0.0.0.0";
    console.log(`QR Stream web app serving at http://${addr}:${port}`);
  });
  return server;
}

// src/cli/qr-stream.ts
var FPS_MS = 100;
var HELP_TEXT = `
QR Stream \u2013 encode text or a file into a looping QR-code sequence.

Usage:
  qr-stream [file]                read from file
  echo "text" | qr-stream         read from stdin
  npx qr-stream [file]            via npx
  bunx qr-stream [file]           via bunx
  qr-stream --serve               start web app preview server

Server flags (with --serve):
  --port <n>    TCP port (default: 3000, also: PORT env)
  --host <ip>   Bind address (default: 0.0.0.0)

Controls:
  q, Q         quit
  Ctrl-C       quit

The app uses the same V10-M QR protocol as the web transfer demo.
`;
function showHelp() {
  console.log(HELP_TEXT.trim());
}
var MIME_TYPES2 = {
  ".txt": "text/plain",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".csv": "text/csv",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream"
};
function mimeFromPath(filePath) {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES2[ext] ?? "application/octet-stream";
}
function readInput() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    const filePath = args[0];
    if (!existsSync2(filePath)) {
      console.error(`Error: file not found: ${filePath}`);
      process.exit(1);
    }
    const basename2 = filePath.split("/").pop() ?? filePath;
    return {
      data: new Uint8Array(readFileSync2(filePath)),
      isText: false,
      filename: basename2,
      mimeType: mimeFromPath(filePath)
    };
  }
  try {
    const buf = new Uint8Array(readFileSync2(0));
    return { data: buf, isText: buf.length > 0 };
  } catch (err) {
    console.error(`Error reading stdin: ${err.message ?? String(err)}`);
    process.exit(1);
  }
}
function buildFrames(data, isText, filename, mimeType) {
  const result = packetize(data, isText, true, filename, mimeType);
  return scheduleFrames(result.packets, result.totalGenerations);
}
function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }
  if (args.includes("--serve") || args.includes("-s")) {
    let shutdown2 = function() {
      console.log("\nShutting down server...");
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 2e3);
    };
    var shutdown = shutdown2;
    let port = 3e3;
    const portIdx = args.indexOf("--port");
    if (portIdx !== -1 && portIdx + 1 < args.length) {
      port = Number(args[portIdx + 1]);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error("Error: --port must be a number between 1 and 65535");
        process.exit(1);
      }
    }
    if (process.env.PORT && args.indexOf("--port") === -1) {
      port = Number(process.env.PORT);
    }
    let host;
    const hostIdx = args.indexOf("--host");
    if (hostIdx !== -1 && hostIdx + 1 < args.length) {
      host = args[hostIdx + 1];
    }
    const server = startServer(port, host);
    process.on("SIGINT", shutdown2);
    process.on("SIGTERM", shutdown2);
    return;
  }
  let data;
  let isText;
  let filename;
  let mimeType;
  try {
    const input = readInput();
    data = input.data;
    isText = input.isText;
    filename = input.filename;
    mimeType = input.mimeType;
  } catch (err) {
    console.error(`Error reading input: ${err.message ?? String(err)}`);
    process.exit(1);
  }
  if (data.length === 0) {
    console.error("Error: no input data. Provide a file path or pipe text to stdin.");
    process.exit(1);
  }
  const packets = buildFrames(data, isText, filename, mimeType);
  const frames = [];
  for (const pkt of packets) {
    const matrix = generateQRMatrix(pkt, QR_VERSION, ECC_LEVEL);
    frames.push(renderToTerminal(matrix));
  }
  const qrHeight = frames[0]?.length ?? 0;
  let running = true;
  let frameIdx = 0;
  let firstDraw = true;
  function draw() {
    if (!running) return;
    const frame = frames[frameIdx];
    if (firstDraw) {
      firstDraw = false;
    } else {
      moveCursorUp(qrHeight);
    }
    process.stdout.write(frame.join("\n") + "\n");
    frameIdx = (frameIdx + 1) % frames.length;
  }
  function cleanup() {
    running = false;
    clearInterval(interval);
    exitAltBuffer();
    showCursor();
    if (ttyFd !== null) {
      try {
        closeSync(ttyFd);
      } catch {
      }
    }
    console.log("QR stream display stopped.");
    process.exit(0);
  }
  enterAltBuffer();
  clearScreen();
  let ttyFd = null;
  try {
    ttyFd = openSync("/dev/tty", "rs");
    const stream = new ReadStream(ttyFd);
    stream.setRawMode(true);
    stream.setEncoding("utf8");
    stream.on("data", (key) => {
      if (key === "q" || key === "Q" || key === "") {
        cleanup();
      }
    });
    stream.resume();
    hideCursor();
  } catch {
    ttyFd = null;
    if (process.stdin.isTTY) {
      hideCursor();
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (key) => {
        if (key === "q" || key === "Q" || key === "") {
          cleanup();
        }
      });
    }
  }
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  draw();
  const interval = setInterval(draw, FPS_MS);
}
main();
