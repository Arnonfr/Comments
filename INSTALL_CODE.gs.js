/**
 * ============================================================================
 *  העתק את כל הקוד הזה לקובץ Code.gs בעורך Apps Script
 * ============================================================================
 *
 *  הוראות התקנה:
 *  1. פתח את Google Apps Script: https://script.google.com
 *  2. צור פרויקט חדש (או פתח פרויקט קיים מתוך Google Docs)
 *  3. מחק את כל הקוד הקיים בקובץ Code.gs
 *  4. העתק והדבק את כל התוכן של קובץ זה לתוך Code.gs
 *  5. צור קובץ HTML חדש בשם "Sidebar" (קובץ > חדש > HTML)
 *     והדבק לתוכו את התוכן מקובץ INSTALL_SIDEBAR.html
 *  6. שמור (Ctrl+S) ורענן את מסמך ה-Google Docs
 *  7. תפריט "בודק עבודות" יופיע בסרגל התפריטים
 *
 * ============================================================================
 */


// #############################################################################
// #                                                                           #
// #                         Code.gs - ראשי                                    #
// #                     תפריט, אתחול, ופונקציות עזר                           #
// #                                                                           #
// #############################################################################

/**
 * בודק עבודות אקדמיות - תוסף לגוגל דוקס
 * בודק מבנה, APA7, ותוכן של הצעות מחקר לתואר ראשון
 */

// ===================== תפריט ואתחול =====================

function onOpen() {
  DocumentApp.getUi()
    .createMenu('בודק עבודות')
    .addItem('הפעל בדיקה מלאה', 'showSidebar')
    .addItem('הגדרות API', 'showSettings')
    .addToUi();
}

function onHomepage() {
  return showSidebar();
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('בודק עבודות אקדמיות')
    .setWidth(420);
  DocumentApp.getUi().showSidebar(html);
}

function showSettings() {
  var ui = DocumentApp.getUi();
  var currentKey = getApiKey();
  var maskedKey = currentKey ? '****' + currentKey.slice(-4) : 'לא הוגדר';

  var result = ui.prompt(
    'הגדרות - מפתח Gemini API',
    'מפתח נוכחי: ' + maskedKey + '\n\n' +
    'הכנס מפתח API של Gemini (ניתן להשיג בחינם מ-Google AI Studio):\n' +
    'https://aistudio.google.com/app/apikey',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() === ui.Button.OK) {
    var key = result.getResponseText().trim();
    if (key) {
      PropertiesService.getUserProperties().setProperty('GEMINI_API_KEY', key);
      ui.alert('המפתח נשמר בהצלחה!');
    }
  }
}

function getApiKey() {
  return PropertiesService.getUserProperties().getProperty('GEMINI_API_KEY') || '';
}

// ===================== פונקציה ראשית =====================

function runFullCheck() {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  var fullText = body.getText();

  if (!fullText || fullText.trim().length < 50) {
    return {
      error: true,
      message: 'המסמך ריק או קצר מדי לבדיקה. ודא שהעבודה מועתקת למסמך.'
    };
  }

  var results = {};

  // 1. בדיקת דף שער
  results.coverPage = checkCoverPage(body, fullText);

  // 2. בדיקת מבנה פרקים
  results.chapters = checkChapterStructure(body, fullText);

  // 3. בדיקת ביבליוגרפיה APA7
  results.apa = checkAPABibliography(body, fullText);

  // 4+5+6. סקירת תוכן עם AI (כולל ביקורת בונה ומתודולוגיה)
  var apiKey = getApiKey();
  if (apiKey) {
    results.contentReview = reviewAllContent(body, fullText, apiKey);
  } else {
    results.contentReview = {
      available: false,
      message: 'לסקירת תוכן מעמיקה, הגדר מפתח Gemini API דרך התפריט: בודק עבודות > הגדרות API'
    };
  }

  // 7. סיכום סופי
  results.summary = generateFinalSummary(results);

  return results;
}

// ===================== פונקציות עזר =====================

/**
 * מחלץ את כל הכותרות מהמסמך
 */
function extractHeadings(body) {
  var headings = [];
  var numChildren = body.getNumChildren();

  for (var i = 0; i < numChildren; i++) {
    var child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
      var para = child.asParagraph();
      var heading = para.getHeading();
      if (heading !== DocumentApp.ParagraphHeading.NORMAL) {
        headings.push({
          text: para.getText().trim(),
          heading: heading,
          index: i
        });
      }
    }
  }
  return headings;
}

/**
 * מחלץ פרקים מהמסמך לפי כותרות
 */
function extractChapters(body) {
  var chapters = [];
  var numChildren = body.getNumChildren();
  var currentChapter = null;

  for (var i = 0; i < numChildren; i++) {
    var child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
      var para = child.asParagraph();
      var heading = para.getHeading();
      var text = para.getText().trim();

      if (heading !== DocumentApp.ParagraphHeading.NORMAL && text.length > 0) {
        if (currentChapter) {
          chapters.push(currentChapter);
        }
        currentChapter = {
          title: text,
          heading: heading,
          content: '',
          startIndex: i
        };
      } else if (currentChapter && text.length > 0) {
        currentChapter.content += text + '\n';
      }
    }
  }

  if (currentChapter) {
    chapters.push(currentChapter);
  }

  return chapters;
}

/**
 * מייצר סיכום סופי
 */
function generateFinalSummary(results) {
  var issues = [];
  var hasBlockingIssues = false;

  if (!results.coverPage.valid) {
    issues.push('דף השער חסר פרטים');
  }
  if (!results.chapters.valid) {
    issues.push('מבנה הפרקים אינו תקין');
    hasBlockingIssues = true;
  }
  if (results.apa.errors && results.apa.errors.length > 5) {
    issues.push('נמצאו שגיאות רבות בביבליוגרפיה');
  }

  var summary = {};

  if (hasBlockingIssues) {
    summary.approved = false;
    summary.text = 'יש לתקן את הבעיות שצוינו לעיל ולהגיש מחדש לבדיקה.';
  } else if (issues.length > 3) {
    summary.approved = false;
    summary.text = 'נמצאו מספר נושאים לתיקון. יש לבצע את התיקונים המבוקשים ולהגיש מחדש.';
  } else {
    summary.approved = true;
    summary.text = 'הצעת המחקר מאושרת. ניתן להתקדם להגשת מדריך ראיון. בהצלחה!';
  }

  summary.issues = issues;
  return summary;
}


// #############################################################################
// #                                                                           #
// #                    StructureChecker.gs                                     #
// #                   בדיקת דף שער ומבנה פרקים                                #
// #                                                                           #
// #############################################################################

// ===================== בדיקת דף שער =====================

function checkCoverPage(body, fullText) {
  var result = {
    valid: true,
    findings: [],
    missing: []
  };

  // לוקחים את 800 התווים הראשונים כדף שער מוערך
  var coverText = fullText.substring(0, 800);

  // בדיקת שם עבודה - בדרך כלל הטקסט הראשון בגודל גדול
  var firstPara = body.getChild(0);
  if (firstPara && firstPara.getType() === DocumentApp.ElementType.PARAGRAPH) {
    var heading = firstPara.asParagraph().getHeading();
    if (heading === DocumentApp.ParagraphHeading.TITLE ||
        heading === DocumentApp.ParagraphHeading.HEADING1) {
      result.findings.push('נמצא כותרת/שם עבודה: "' + firstPara.asParagraph().getText().trim().substring(0, 60) + '"');
    }
  }

  // בדיקת שם סטודנט/ית
  var studentPatterns = [
    /שם\s*(ה)?סטודנט(ית)?[\s:]+(.+)/,
    /הוגש\s*על\s*ידי[\s:]+(.+)/,
    /מגיש(ה|ת)?[\s:]+(.+)/,
    /נכתב\s*על\s*ידי[\s:]+(.+)/,
    /שם\s*(ה)?תלמיד(ה)?[\s:]+(.+)/
  ];

  var foundStudent = false;
  for (var i = 0; i < studentPatterns.length; i++) {
    if (studentPatterns[i].test(coverText)) {
      foundStudent = true;
      result.findings.push('נמצא שם סטודנט/ית');
      break;
    }
  }
  if (!foundStudent) {
    // בדיקה אם יש שם כלשהו בטקסט הראשוני (heuristic)
    var namePattern = /^[א-ת\s]{4,30}$/m;
    var nameLines = coverText.split('\n').filter(function(line) {
      return namePattern.test(line.trim()) && line.trim().length > 3;
    });
    if (nameLines.length >= 1) {
      result.findings.push('ייתכן ונמצא שם (לא בפורמט מובנה): "' + nameLines[0].trim() + '"');
    } else {
      result.missing.push('שם הסטודנט/ית - לא נמצא בדף השער');
      result.valid = false;
    }
  }

  // בדיקת שם מנחה
  var advisorPatterns = [
    /מנח(ה|את)[\s:]+(.+)/,
    /בהנחיית[\s:]+(.+)/,
    /מרצ(ה|את?)[\s:]+(.+)/,
    /בהדרכת[\s:]+(.+)/,
    /מנחה\s*אקדמי(ת)?[\s:]+(.+)/,
    /(דר|ד"ר|פרופ|פרופ')[\s'.]+[א-ת\s]+/
  ];

  var foundAdvisor = false;
  for (var i = 0; i < advisorPatterns.length; i++) {
    if (advisorPatterns[i].test(coverText)) {
      foundAdvisor = true;
      result.findings.push('נמצא שם מנחה');
      break;
    }
  }
  if (!foundAdvisor) {
    result.missing.push('שם המנחה - לא נמצא בדף השער');
    result.valid = false;
  }

  // בדיקת תאריך
  var datePatterns = [
    /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/,                    // 01/01/2024
    /\d{4}/,                                                      // שנה בלבד
    /(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s*\d{4}/,
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}/i,
    /תש[א-ת]"[א-ת]/,                                          // תאריך עברי
    /סמסטר\s*[אב]/                                              // סמסטר
  ];

  var foundDate = false;
  for (var i = 0; i < datePatterns.length; i++) {
    if (datePatterns[i].test(coverText)) {
      foundDate = true;
      result.findings.push('נמצא תאריך');
      break;
    }
  }
  if (!foundDate) {
    result.missing.push('תאריך - לא נמצא בדף השער');
    result.valid = false;
  }

  // בדיקת שם מוסד (בונוס)
  var institutionPatterns = [
    /אוניברסיט/,
    /מכלל/,
    /קולג/,
    /המחלקה ל/,
    /בית הספר ל/,
    /הפקולטה ל/,
    /החוג ל/
  ];

  for (var i = 0; i < institutionPatterns.length; i++) {
    if (institutionPatterns[i].test(coverText)) {
      result.findings.push('נמצא שם מוסד אקדמי');
      break;
    }
  }

  return result;
}

// ===================== בדיקת מבנה פרקים =====================

function checkChapterStructure(body, fullText) {
  var result = {
    valid: true,
    findings: [],
    missing: [],
    chaptersFound: []
  };

  var headings = extractHeadings(body);
  var textLower = fullText;

  // הפרקים הנדרשים
  var requiredChapters = [
    {
      name: 'מבוא',
      number: 1,
      patterns: [/מבוא/, /הקדמה/, /פרק\s*1/, /chapter\s*1/i, /introduction/i]
    },
    {
      name: 'סקירת ספרות',
      number: 2,
      patterns: [/סקירת\s*ספרות/, /סקירה\s*ספרותית/, /רקע\s*תיאורטי/, /פרק\s*2/, /chapter\s*2/i, /literature\s*review/i]
    },
    {
      name: 'מתודולוגיה / השיטה',
      number: 3,
      patterns: [/מתודולוגי/, /השיטה/, /שיטת\s*המחקר/, /מערך\s*המחקר/, /פרק\s*3/, /chapter\s*3/i, /method/i]
    },
    {
      name: 'ביבליוגרפיה',
      number: 4,
      patterns: [/ביבליוגרפי/, /רשימת\s*מקורות/, /מקורות/, /references/i, /bibliography/i]
    }
  ];

  // בדיקת כל פרק נדרש
  for (var c = 0; c < requiredChapters.length; c++) {
    var chapter = requiredChapters[c];
    var found = false;
    var foundInHeading = false;
    var foundHeadingText = '';

    // חיפוש בכותרות
    for (var h = 0; h < headings.length; h++) {
      for (var p = 0; p < chapter.patterns.length; p++) {
        if (chapter.patterns[p].test(headings[h].text)) {
          found = true;
          foundInHeading = true;
          foundHeadingText = headings[h].text;
          break;
        }
      }
      if (found) break;
    }

    // אם לא נמצא בכותרות, חפש בטקסט
    if (!found) {
      for (var p = 0; p < chapter.patterns.length; p++) {
        if (chapter.patterns[p].test(textLower)) {
          found = true;
          break;
        }
      }
    }

    if (found && foundInHeading) {
      result.findings.push('פרק ' + chapter.number + ' (' + chapter.name + ') - נמצא כ: "' + foundHeadingText + '"');
      result.chaptersFound.push({
        name: chapter.name,
        number: chapter.number,
        headingText: foundHeadingText
      });
    } else if (found) {
      result.findings.push('פרק ' + chapter.number + ' (' + chapter.name + ') - נמצא בטקסט אך לא מסומן ככותרת. מומלץ להגדיר ככותרת (Heading)');
      result.chaptersFound.push({
        name: chapter.name,
        number: chapter.number,
        headingText: ''
      });
    } else {
      result.missing.push('פרק ' + chapter.number + ' (' + chapter.name + ') - לא נמצא');
      result.valid = false;
    }
  }

  // בדיקת סדר הפרקים
  if (result.chaptersFound.length >= 2) {
    var orderCorrect = true;
    for (var i = 1; i < result.chaptersFound.length; i++) {
      if (result.chaptersFound[i].number < result.chaptersFound[i - 1].number) {
        orderCorrect = false;
        break;
      }
    }
    if (orderCorrect) {
      result.findings.push('סדר הפרקים תקין');
    } else {
      result.findings.push('שים לב: סדר הפרקים אינו כמצופה');
      result.valid = false;
    }
  }

  // בדיקת מספור עקבי בכותרות
  var numberedHeadings = headings.filter(function(h) {
    return /^\d+[\.\)]/.test(h.text) || /^פרק\s*\d+/.test(h.text);
  });

  if (numberedHeadings.length > 0) {
    result.findings.push('נמצא מספור בכותרות (' + numberedHeadings.length + ' כותרות ממוספרות)');
  } else {
    result.findings.push('הערה: לא נמצא מספור מפורש בכותרות הפרקים');
  }

  return result;
}


// #############################################################################
// #                                                                           #
// #                       APAChecker.gs                                       #
// #                  בדיקת ביבליוגרפיה לפי כללי APA7                          #
// #                                                                           #
// #############################################################################

function checkAPABibliography(body, fullText) {
  var result = {
    found: false,
    referenceCount: 0,
    errors: [],
    warnings: [],
    findings: []
  };

  // מציאת קטע הביבליוגרפיה
  var bibSection = findBibliographySection(fullText);

  if (!bibSection) {
    result.errors.push('לא נמצא קטע ביבליוגרפיה במסמך. ודא שיש כותרת "ביבליוגרפיה" או "רשימת מקורות" או "References"');
    return result;
  }

  result.found = true;
  result.findings.push('נמצא קטע ביבליוגרפיה');

  // פירוק לרשומות בודדות
  var references = parseReferences(bibSection);
  result.referenceCount = references.length;
  result.findings.push('נמצאו ' + references.length + ' רשומות ביבליוגרפיות');

  if (references.length === 0) {
    result.errors.push('לא נמצאו רשומות ביבליוגרפיות. ודא שכל רשומה מופרדת בשורה חדשה');
    return result;
  }

  // בדיקה כל רשומה
  for (var i = 0; i < references.length; i++) {
    var ref = references[i].trim();
    if (ref.length < 10) continue;

    var refErrors = validateAPAReference(ref, i + 1);
    result.errors = result.errors.concat(refErrors.errors);
    result.warnings = result.warnings.concat(refErrors.warnings);
  }

  // בדיקת סדר אלפביתי
  checkAlphabeticalOrder(references, result);

  // בדיקות כלליות
  checkGeneralAPARules(references, result);

  return result;
}

/**
 * מוצא את קטע הביבליוגרפיה במסמך
 */
function findBibliographySection(fullText) {
  var bibPatterns = [
    /(?:ביבליוגרפיה|רשימת\s*מקורות|מקורות|references|bibliography)\s*\n([\s\S]+)$/i
  ];

  for (var i = 0; i < bibPatterns.length; i++) {
    var match = fullText.match(bibPatterns[i]);
    if (match) {
      return match[1].trim();
    }
  }

  // fallback: חיפוש מהסוף
  var lines = fullText.split('\n');
  for (var j = lines.length - 1; j >= 0; j--) {
    var line = lines[j].trim().toLowerCase();
    if (line === 'ביבליוגרפיה' || line === 'רשימת מקורות' ||
        line === 'references' || line === 'bibliography' || line === 'מקורות') {
      return lines.slice(j + 1).join('\n').trim();
    }
  }

  return null;
}

/**
 * מפרק את הביבליוגרפיה לרשומות בודדות
 */
function parseReferences(bibText) {
  var lines = bibText.split('\n');
  var references = [];
  var currentRef = '';

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.length === 0) {
      if (currentRef.length > 0) {
        references.push(currentRef.trim());
        currentRef = '';
      }
      continue;
    }

    // רשומה חדשה מתחילה בדרך כלל עם שם משפחה (אות גדולה באנגלית או אות עברית)
    // או עם תווים שאינם רווח בתחילת השורה (אחרי שורה ריקה)
    var isNewEntry = false;

    if (currentRef.length > 0) {
      // בדיקה אם זו שורה חדשה של רשומה חדשה
      // רשומה חדשה מתחילה בדרך כלל עם שם (uppercase letter or Hebrew)
      if (/^[A-Z\u0590-\u05FF]/.test(line) && /\(\d{4}/.test(line)) {
        isNewEntry = true;
      }
    }

    if (isNewEntry) {
      references.push(currentRef.trim());
      currentRef = line;
    } else {
      currentRef += (currentRef.length > 0 ? ' ' : '') + line;
    }
  }

  if (currentRef.trim().length > 0) {
    references.push(currentRef.trim());
  }

  return references;
}

/**
 * בודק רשומה בודדת מול כללי APA7
 */
function validateAPAReference(ref, index) {
  var errors = [];
  var warnings = [];
  var refPreview = ref.substring(0, 50) + (ref.length > 50 ? '...' : '');

  // בדיקה 1: שנה בסוגריים
  var yearPattern = /\((\d{4}[a-z]?)\)/;
  if (!yearPattern.test(ref)) {
    // בדיקה אם יש שנה אבל ללא סוגריים
    if (/\d{4}/.test(ref)) {
      errors.push('רשומה ' + index + ': השנה צריכה להופיע בסוגריים עגולים, לדוגמה: (2024) - "' + refPreview + '"');
    } else {
      errors.push('רשומה ' + index + ': לא נמצאה שנת פרסום - "' + refPreview + '"');
    }
  } else {
    var yearMatch = ref.match(yearPattern);
    var year = parseInt(yearMatch[1]);
    if (year < 1900 || year > 2030) {
      warnings.push('רשומה ' + index + ': שנה לא סבירה (' + year + ') - "' + refPreview + '"');
    }
  }

  // בדיקה 2: נקודה בסוף הרשומה
  var lastChar = ref.trim().slice(-1);
  if (lastChar !== '.' && !ref.match(/https?:\/\/\S+$/)) {
    // URL בסוף הרשומה פטור מנקודה (APA7)
    warnings.push('רשומה ' + index + ': חסרה נקודה בסוף הרשומה - "' + refPreview + '"');
  }

  // בדיקה 3: פורמט מחבר - שם משפחה, ראשי תיבות
  var isEnglish = /^[A-Z]/.test(ref);
  if (isEnglish) {
    // בדיקת פורמט: LastName, F. I.
    var authorPart = ref.split(/\(\d{4}/)[0];
    if (authorPart) {
      // בדיקה שיש פסיק אחרי שם המשפחה
      if (!/^[A-Z][a-z]+,\s*[A-Z]\./.test(authorPart.trim())) {
        warnings.push('רשומה ' + index + ': ודא פורמט מחבר תקין: שם משפחה, א. ת. - "' + refPreview + '"');
      }

      // בדיקת & לפני מחבר אחרון (אם יש יותר ממחבר אחד)
      if (authorPart.indexOf(',') !== authorPart.lastIndexOf(',') &&
          authorPart.indexOf('&') === -1 && authorPart.indexOf('et al') === -1) {
        warnings.push('רשומה ' + index + ': כשיש מספר מחברים, יש להשתמש ב-& לפני המחבר האחרון - "' + refPreview + '"');
      }
    }
  }

  // בדיקה 4: DOI - APA7 דורש DOI כאשר זמין
  if (isEnglish && ref.toLowerCase().indexOf('doi') === -1 &&
      ref.indexOf('https://doi.org') === -1 &&
      ref.indexOf('http') === -1) {
    // ייתכן שזה ספר ולא מאמר - רק אזהרה
    if (/journal|review|quarterly|bulletin/i.test(ref)) {
      warnings.push('רשומה ' + index + ': מאמר בכתב עת - ודא שנכלל DOI אם זמין (APA7) - "' + refPreview + '"');
    }
  }

  // בדיקה 5: פורמט DOI ב-APA7 - צריך להיות https://doi.org/
  if (/doi:\s*10\./i.test(ref) || /DOI\s*10\./i.test(ref)) {
    errors.push('רשומה ' + index + ': ב-APA7 יש לכתוב DOI בפורמט: https://doi.org/10.xxxx (ולא doi: 10.xxxx) - "' + refPreview + '"');
  }

  // בדיקה 6: et al בביבליוגרפיה
  if (/et al\.?/i.test(ref)) {
    // ב-APA7, ברשימת המקורות יש לרשום עד 20 מחברים (לא et al)
    warnings.push('רשומה ' + index + ': ב-APA7 יש לרשום את כל המחברים ברשימת המקורות (עד 20). השימוש ב-et al. הוא רק בגוף הטקסט - "' + refPreview + '"');
  }

  // בדיקה 7: Retrieved from (שינוי מ-APA6 ל-APA7)
  if (/retrieved from/i.test(ref)) {
    warnings.push('רשומה ' + index + ': ב-APA7 לא משתמשים ב-"Retrieved from" - פשוט כתוב את הכתובת - "' + refPreview + '"');
  }

  // בדיקה 8: כותרת באיטליק (לא ניתן לבדוק פורמט, אבל בודקים נוכחות כותרת)
  if (isEnglish) {
    var afterYear = ref.split(/\)\.\s*/)[1];
    if (afterYear && afterYear.trim().length < 3) {
      errors.push('רשומה ' + index + ': ייתכן שחסרה כותרת אחרי השנה - "' + refPreview + '"');
    }
  }

  return { errors: errors, warnings: warnings };
}

/**
 * בודק סדר אלפביתי של רשומות
 */
function checkAlphabeticalOrder(references, result) {
  if (references.length < 2) return;

  var outOfOrder = [];
  for (var i = 1; i < references.length; i++) {
    var prev = references[i - 1].trim().toLowerCase();
    var curr = references[i].trim().toLowerCase();

    // השוואת האותיות הראשונות
    if (curr < prev) {
      outOfOrder.push(i + 1);
    }
  }

  if (outOfOrder.length === 0) {
    result.findings.push('הרשומות מסודרות בסדר אלפביתי - תקין');
  } else if (outOfOrder.length <= 3) {
    result.warnings.push('רשומות שייתכן ואינן בסדר אלפביתי: מספרי רשומות ' + outOfOrder.join(', '));
  } else {
    result.errors.push('הביבליוגרפיה אינה מסודרת בסדר אלפביתי. יש לסדר את הרשומות לפי שם המשפחה של המחבר הראשון');
  }
}

/**
 * בדיקות כלליות של הביבליוגרפיה
 */
function checkGeneralAPARules(references, result) {
  // בדיקת כמות מקורות
  if (references.length < 5) {
    result.warnings.push('מספר המקורות נמוך (' + references.length + '). בדרך כלל הצעת מחקר לתואר ראשון כוללת לפחות 10-15 מקורות');
  } else if (references.length < 10) {
    result.warnings.push('מספר המקורות סביר (' + references.length + ') אך מומלץ לשאוף ל-15+ מקורות');
  } else {
    result.findings.push('מספר מקורות תקין: ' + references.length);
  }

  // בדיקת מגוון שפות
  var hebrewRefs = 0;
  var englishRefs = 0;
  for (var i = 0; i < references.length; i++) {
    if (/^[A-Z]/.test(references[i].trim())) {
      englishRefs++;
    } else if (/^[\u0590-\u05FF]/.test(references[i].trim())) {
      hebrewRefs++;
    }
  }

  if (hebrewRefs > 0 && englishRefs > 0) {
    result.findings.push('נמצאו מקורות בעברית (' + hebrewRefs + ') ובאנגלית (' + englishRefs + ') - מגוון תקין');
  } else if (englishRefs === 0 && hebrewRefs > 0) {
    result.warnings.push('כל המקורות בעברית. מומלץ לכלול גם מקורות באנגלית');
  }

  // בדיקת עדכניות מקורות
  var currentYear = new Date().getFullYear();
  var oldRefs = 0;
  var recentRefs = 0;
  for (var j = 0; j < references.length; j++) {
    var yearMatch = references[j].match(/\((\d{4})/);
    if (yearMatch) {
      var year = parseInt(yearMatch[1]);
      if (year < currentYear - 15) oldRefs++;
      if (year >= currentYear - 5) recentRefs++;
    }
  }

  if (oldRefs > references.length / 2) {
    result.warnings.push('חלק ניכר מהמקורות ישנים (מעל 15 שנה). מומלץ לעדכן עם מחקרים עדכניים יותר');
  }
  if (recentRefs >= 3) {
    result.findings.push('נמצאו ' + recentRefs + ' מקורות עדכניים (5 שנים אחרונות)');
  } else {
    result.warnings.push('מומלץ לכלול יותר מקורות עדכניים (מ-5 השנים האחרונות)');
  }
}


// #############################################################################
// #                                                                           #
// #                     ContentReviewer.gs                                     #
// #              סקירת תוכן אקדמית באמצעות Gemini AI                          #
// #          כולל ביקורת בונה לכל פרק והתמקדות בפרק השיטה                     #
// #                                                                           #
// #############################################################################

// ===================== סקירת תוכן כוללת =====================

function reviewAllContent(body, fullText, apiKey) {
  var result = {
    available: true,
    chapters: [],
    methodology: null,
    generalComments: []
  };

  var chapters = extractChapters(body);

  if (chapters.length === 0) {
    result.available = false;
    result.message = 'לא ניתן לזהות פרקים במסמך. ודא שהכותרות מסומנות כ-Heading';
    return result;
  }

  // סקירת כל פרק
  for (var i = 0; i < chapters.length; i++) {
    var chapter = chapters[i];
    var isMethodology = isMethodologyChapter(chapter.title);
    var isBibliography = isBibliographyChapter(chapter.title);

    // דילוג על ביבליוגרפיה - נבדקת בנפרד
    if (isBibliography) continue;

    if (isMethodology) {
      // פרק השיטה - בדיקה מעמיקה (דרישה 6)
      result.methodology = reviewMethodologyChapter(chapter, apiKey);
    }

    // ביקורת בונה לכל פרק (דרישה 4)
    var chapterReview = reviewSingleChapter(chapter, isMethodology, apiKey);
    if (chapterReview) {
      result.chapters.push(chapterReview);
    }
  }

  return result;
}

// ===================== זיהוי סוג פרק =====================

function isMethodologyChapter(title) {
  var patterns = [/מתודולוגי/, /השיטה/, /שיטת\s*המחקר/, /מערך\s*המחקר/, /method/i];
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].test(title)) return true;
  }
  return false;
}

function isBibliographyChapter(title) {
  var patterns = [/ביבליוגרפי/, /רשימת\s*מקורות/, /references/i, /bibliography/i];
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].test(title)) return true;
  }
  return false;
}

// ===================== סקירת פרק בודד =====================

function reviewSingleChapter(chapter, isMethodology, apiKey) {
  if (!chapter.content || chapter.content.trim().length < 30) {
    return {
      title: chapter.title,
      comments: [{ type: 'warning', text: 'הפרק קצר מאוד או ריק. יש להרחיב.' }]
    };
  }

  // קיצור תוכן אם ארוך מדי (מגבלת API)
  var content = chapter.content;
  if (content.length > 6000) {
    content = content.substring(0, 3000) + '\n\n[...]\n\n' + content.substring(content.length - 3000);
  }

  var prompt = buildChapterReviewPrompt(chapter.title, content, isMethodology);
  var response = callGeminiAPI(prompt, apiKey);

  if (!response) {
    return {
      title: chapter.title,
      comments: [{ type: 'error', text: 'לא ניתן לסקור פרק זה - שגיאת API' }]
    };
  }

  return parseChapterReviewResponse(chapter.title, response);
}

// ===================== סקירת פרק שיטה מעמיקה =====================

function reviewMethodologyChapter(chapter, apiKey) {
  if (!chapter.content || chapter.content.trim().length < 50) {
    return {
      title: chapter.title,
      assessment: 'הפרק קצר מדי לביצוע סקירה מעמיקה',
      comments: []
    };
  }

  var content = chapter.content;
  if (content.length > 8000) {
    content = content.substring(0, 4000) + '\n\n[...]\n\n' + content.substring(content.length - 4000);
  }

  var prompt = buildMethodologyPrompt(content);
  var response = callGeminiAPI(prompt, apiKey);

  if (!response) {
    return {
      title: chapter.title,
      assessment: 'לא ניתן לסקור - שגיאת API',
      comments: []
    };
  }

  return parseMethodologyResponse(chapter.title, response);
}

// ===================== בניית פרומפטים =====================

function buildChapterReviewPrompt(title, content, isMethodology) {
  return 'אתה מנחה אקדמי מנוסה הבודק הצעת מחקר של סטודנט/ית לתואר ראשון.\n' +
    'קרא את הפרק הבא ותן בדיוק 3 הערות ביקורת בונות.\n' +
    'חשוב: שלב מחמאות כנות עם הצעות לשיפור. לפחות הערה אחת חיובית ולפחות הערה אחת ביקורתית.\n' +
    'התייחס לאיכות הכתיבה האקדמית, לבהירות הטיעונים, ולרמה המתאימה למחקר של תואר ראשון.\n' +
    (isMethodology ? 'שים לב: זהו פרק השיטה - התייחס גם לבהירות התיאור המתודולוגי.\n' : '') +
    '\n' +
    'שם הפרק: ' + title + '\n' +
    'תוכן הפרק:\n' + content + '\n\n' +
    'תן את תשובתך בפורמט הבא בדיוק (JSON):\n' +
    '{\n' +
    '  "comments": [\n' +
    '    {"type": "praise", "text": "הערה חיובית כאן"},\n' +
    '    {"type": "criticism", "text": "ביקורת בונה כאן"},\n' +
    '    {"type": "suggestion", "text": "הצעה לשיפור כאן"}\n' +
    '  ],\n' +
    '  "writingQuality": "good/fair/needs_improvement",\n' +
    '  "academicLevel": "appropriate/needs_work/insufficient"\n' +
    '}\n' +
    'חשוב: ענה רק ב-JSON תקין, בעברית, ללא טקסט נוסף.';
}

function buildMethodologyPrompt(content) {
  return 'אתה מנחה אקדמי מנוסה הבודק את פרק השיטה/מתודולוגיה בהצעת מחקר של סטודנט/ית לתואר ראשון.\n' +
    'בצע סקירה מעמיקה ומפורטת של הפרק. התמקד בנקודות הבאות:\n\n' +
    '1. ניסוח - האם הניסוח ברור, מדויק ואקדמי?\n' +
    '2. בהירות - האם ברור מה הסטודנט/ית מתכוון/ת לעשות?\n' +
    '3. שיטת מחקר - האם השיטה מתאימה לשאלות/השערות המחקר?\n' +
    '4. אוכלוסיית מחקר - האם מוגדרת היטב? גודל מדגם, קריטריונים להכללה/הדרה?\n' +
    '5. כלי מחקר - האם מתוארים כראוי? תוקף ומהימנות?\n' +
    '6. הליך המחקר - האם שלבי המחקר ברורים?\n' +
    '7. שיקולים אתיים - האם נכללים?\n' +
    '8. הרחבה/השמטה - האם יש סעיפים שדורשים הרחבה? האם יש מידע מיותר?\n' +
    '9. נכונות - האם יש טענות לא נכונות או לא מדויקות?\n\n' +
    'תוכן פרק השיטה:\n' + content + '\n\n' +
    'תן את תשובתך בפורמט הבא בדיוק (JSON):\n' +
    '{\n' +
    '  "overallAssessment": "הערכה כללית בפסקה קצרה",\n' +
    '  "comments": [\n' +
    '    {"category": "קטגוריה", "type": "praise/criticism/suggestion", "text": "הערה מפורטת", "priority": "high/medium/low"},\n' +
    '    ...\n' +
    '  ],\n' +
    '  "clarity": "clear/mostly_clear/unclear",\n' +
    '  "completeness": "complete/mostly_complete/needs_expansion/missing_elements",\n' +
    '  "needsExpansion": ["סעיף 1", "סעיף 2"],\n' +
    '  "canBeRemoved": ["סעיף שמיותר אם יש"]\n' +
    '}\n' +
    'חשוב: ענה רק ב-JSON תקין, בעברית, ללא טקסט נוסף. תן לפחות 5 הערות מפורטות.';
}

// ===================== קריאה ל-Gemini API =====================

function callGeminiAPI(prompt, apiKey) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

  var payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      topP: 0.9
    }
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var statusCode = response.getResponseCode();

    if (statusCode !== 200) {
      Logger.log('Gemini API error: ' + statusCode + ' - ' + response.getContentText());
      return null;
    }

    var json = JSON.parse(response.getContentText());

    if (json.candidates && json.candidates[0] && json.candidates[0].content) {
      return json.candidates[0].content.parts[0].text;
    }

    return null;
  } catch (e) {
    Logger.log('Gemini API exception: ' + e.message);
    return null;
  }
}

// ===================== פירוש תשובות =====================

function parseChapterReviewResponse(title, responseText) {
  var result = {
    title: title,
    comments: [],
    writingQuality: '',
    academicLevel: ''
  };

  try {
    // ניקוי markdown wrappers אם יש
    var cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var data = JSON.parse(cleaned);

    if (data.comments && Array.isArray(data.comments)) {
      result.comments = data.comments;
    }
    result.writingQuality = data.writingQuality || '';
    result.academicLevel = data.academicLevel || '';
  } catch (e) {
    // אם הפירוש נכשל, ננסה לחלץ את הטקסט כמו שהוא
    result.comments = [{
      type: 'info',
      text: responseText.substring(0, 1000)
    }];
  }

  return result;
}

function parseMethodologyResponse(title, responseText) {
  var result = {
    title: title,
    overallAssessment: '',
    comments: [],
    clarity: '',
    completeness: '',
    needsExpansion: [],
    canBeRemoved: []
  };

  try {
    var cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var data = JSON.parse(cleaned);

    result.overallAssessment = data.overallAssessment || '';
    result.comments = data.comments || [];
    result.clarity = data.clarity || '';
    result.completeness = data.completeness || '';
    result.needsExpansion = data.needsExpansion || [];
    result.canBeRemoved = data.canBeRemoved || [];
  } catch (e) {
    result.overallAssessment = responseText.substring(0, 1000);
  }

  return result;
}
