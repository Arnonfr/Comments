/**
 * StructureChecker.gs
 * בדיקת דף שער ומבנה פרקים
 */

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
