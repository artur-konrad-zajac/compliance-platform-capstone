export const getTabs = (cfg: any) => {
  if (!cfg) return [];
  if (Array.isArray(cfg.tabs)) return cfg.tabs;
  if (cfg.tabs_layout && cfg.tabs) {
    const layoutTabs = cfg.tabs_layout.map((id: string) => cfg.tabs[id]).filter(Boolean);
    const layoutSet = new Set(cfg.tabs_layout);
    const orphanedTabs = Object.keys(cfg.tabs)
      .filter(id => !layoutSet.has(id))
      .map(id => cfg.tabs[id])
      .filter(Boolean);
    return [...layoutTabs, ...orphanedTabs];
  }
  return [];
};

export const getQuestions = (tab: any) => {
  if (!tab) return [];
  if (Array.isArray(tab.questions)) return tab.questions;
  if (tab.layout && tab.questions) {
    const layoutQs = tab.layout.map((id: string) => tab.questions[id]).filter(Boolean);
    const layoutSet = new Set(tab.layout);
    const orphanedQs = Object.keys(tab.questions)
      .filter(id => !layoutSet.has(id))
      .map(id => tab.questions[id])
      .filter(Boolean);
    return [...layoutQs, ...orphanedQs];
  }
  return [];
};

export const evaluateExpression = (expr: string, answers: Record<string, any>): boolean => {
  if (!expr || !expr.trim()) return true;

  let jsExpr = expr;

  // Handle SOME and EVERY
  jsExpr = jsExpr.replace(/\b(SOME|EVERY)\(([^,]+),\s*(.+?)\)/g, (_, func, listId, subExpr) => {
    let innerJs = subExpr.replace(/(['"])(?:(?=(\\?))\2.)*?\1|\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match: string, quote: string, _bs: string, identifier: string) => {
      if (quote) return match;
      if (identifier === 'AND') return '&&';
      if (identifier === 'OR') return '||';
      if (identifier === 'NOT') return '!';
      if (['true', 'false', 'null'].includes(identifier)) return match;
      return `row["${identifier}"]`;
    });
    
    innerJs = innerJs.replace(/(row\["[^"\]]+"\])\s*==\s*(['"][^'"]+['"])/g, '(Array.isArray($1) ? $1.includes($2) : String($1) === String($2))');
    innerJs = innerJs.replace(/(row\["[^"\]]+"\])\s*!=\s*(['"][^'"]+['"])/g, '(Array.isArray($1) ? !$1.includes($2) : String($1) !== String($2))');

    const method = func === 'SOME' ? 'some' : 'every';
    return `(Array.isArray(answers["${listId.trim()}"]) ? answers["${listId.trim()}"].${method}(row => ${innerJs}) : false)`;
  });

  // Replace identifiers with answers["..."]
  jsExpr = jsExpr.replace(/(['"])(?:(?=(\\?))\2.)*?\1|\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match: string, quote: string, _bs: string, identifier: string) => {
    if (quote) return match;
    if (identifier === 'AND') return '&&';
    if (identifier === 'OR') return '||';
    if (identifier === 'NOT') return '!';
    const reserved = ['true', 'false', 'null', 'answers', 'Array', 'String', 'row', 'includes', 'length', 'indexOf'];
    if (reserved.includes(identifier)) return match;
    return `answers["${identifier}"]`;
  });

  // Handle ==, ===, !=, and !== for arrays natively
  jsExpr = jsExpr.replace(/(answers\["[^"\]]+"\])\s*={2,3}\s*(['"][^'"]+['"])/g, '(Array.isArray($1) ? $1.includes($2) : String($1) === String($2))');
  jsExpr = jsExpr.replace(/(answers\["[^"\]]+"\])\s*!==?\s*(['"][^'"]+['"])/g, '(Array.isArray($1) ? !$1.includes($2) : String($1) !== String($2))');
  
  try {
    const evaluator = new Function('answers', `return !!(${jsExpr});`);
    return evaluator(answers);
  } catch (e) {
    console.error("Failed to evaluate expression:", expr, e);
    return false;
  }
};

export const checkIsVisible = (q: any, answers: Record<string, any>): boolean => {
  // Support legacy dependsOn object if it still exists
  if (q.dependsOn && q.dependsOn.questionId !== undefined) {
    if (String(answers[q.dependsOn.questionId]) !== String(q.dependsOn.value)) {
      return false;
    }
  }
  
  // Support new dependsOnExpression
  if (q.dependsOnExpression && q.dependsOnExpression.trim() !== '') {
    return evaluateExpression(q.dependsOnExpression, answers);
  }
  
  return true;
};

export const validateFormConfig = (config: any) => {
  const allQuestionIds = new Set<string>();
  const questionOptions = new Map<string, string[]>();

  // Gather all valid questions and their options
  getTabs(config).forEach((t: any) => {
    getQuestions(t).forEach((q: any) => {
      allQuestionIds.add(q.id);
      if (q.options) {
        questionOptions.set(q.id, q.options);
      }
      const fields = Array.isArray(q.subFields) ? q.subFields : (Array.isArray(q.fields) ? q.fields : []);
      fields.forEach((sf: any) => {
        allQuestionIds.add(sf.id);
        if (sf.options) {
          questionOptions.set(sf.id, sf.options);
        }
      });
    });
  });

  // Validate dependsOnExpression
  const validateQ = (q: any) => {
    if (q.dependsOnExpression && q.dependsOnExpression.trim() !== '') {
      const expr = q.dependsOnExpression;
      
      // Find all referenced question IDs
      const referencedIds: string[] = [];
      expr.replace(/(['"])(?:(?=(\\?))\2.)*?\1|\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match: string, quote: string, _bs: string, identifier: string) => {
        if (!quote && !['AND', 'OR', 'NOT', 'SOME', 'EVERY', 'true', 'false', 'null', 'includes', 'length', 'indexOf'].includes(identifier)) {
          referencedIds.push(identifier);
        }
        return match;
      });

      for (const id of referencedIds) {
        if (!allQuestionIds.has(id)) {
          throw new Error(`Question "${q.text}" (${q.id}) depends on a non-existent question ID: ${id}`);
        }
      }
      
      // Find all operator checks e.g. q_abc == 'Value' or q_abc > "Value"
      const regex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:==|!=|<|<=|>|>=)\s*(['"])(.*?)\2/g;
      let match;
      while ((match = regex.exec(expr)) !== null) {
        const id = match[1];
        const val = match[3];
        
        if (questionOptions.has(id)) {
          const opts = questionOptions.get(id) || [];
          if (!opts.includes(val)) {
            throw new Error(`Question "${q.text}" (${q.id}) checks if ${id} equals "${val}", but "${val}" is not a valid option for that question.`);
          }
        }
      }
      
      // Test evaluation syntax
      try {
        evaluateExpression(expr, {});
      } catch (e) {
        throw new Error(`Syntax error in expression for "${q.text}" (${q.id}): ${expr}`);
      }
    }
  };

  getTabs(config).forEach((t: any) => {
    getQuestions(t).forEach((q: any) => {
      validateQ(q);
      const fields = Array.isArray(q.subFields) ? q.subFields : (Array.isArray(q.fields) ? q.fields : []);
      fields.forEach((sf: any) => validateQ(sf));
    });
  });
};
