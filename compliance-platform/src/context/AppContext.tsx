import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { get, set } from 'idb-keyval';
import initialConfig from '../config.json';
import { checkIsVisible, getTabs, getQuestions } from '../utils/expressionParser';
import { getInstanceId } from '../utils/instanceId';

type Role = 'customer' | 'validator' | 'builder' | 'admin';
type CaseStatus = 'draft' | 'submitted' | 'in_review' | 'reviewed' | 'validated' | 'rejected' | 'concluded' | 'needs_revision';

export type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  timestamp: number;
  isAI?: boolean;
  isDraft?: boolean;
};

export interface MigrationRule {
  action: 'copy' | 'discard' | 'coerce';
}

export type MigrationMap = Record<string, MigrationRule>;

export interface Question {
  id: string;
  text: string;
  type: 'text' | 'textarea' | 'radio' | 'checkbox' | 'file' | 'dynamic-list' | 'label';
  required?: boolean;
  options?: string[];
  placeholder?: string;
  tooltip?: string;
  dependsOnExpression?: string;

  subFields?: Question[]; // Recursive definitions for dynamic lists
  // Additional configuration for specific types
  minRows?: number; // for 'dynamic-list'
  maxRows?: number; // for 'dynamic-list'
  fileUploadConfig?: {
    multiple?: boolean;
    maxFiles?: number;
  };
}

export interface Case {
  id: string;
  customerId: string;
  customerName: string;
  status: CaseStatus;
  answers: Record<string, any>;
  reviews: Record<string, 'approved' | 'rejected' | 'read' | null>;
  validations: Record<string, 'approved' | 'rejected' | null>;
  chats: Record<string, ChatMessage[]>;
  changedAnswers: Record<string, boolean>;
  unreadByStaff: Record<string, boolean>;
  unreadByCustomer: Record<string, boolean>;
  aiRecommendations?: Record<string, string>;
  aiExplanations?: Record<string, string>;
  configVersion: number;
  createdAt: number;
  updatedAt: number;
}

export const getCaseProgress = (c: Case, config: any) => {
  let totalApplicable = 0;
  let totalAnswered = 0;
  let totalReviewed = 0;
  let totalReviewedRejected = 0;
  let totalReviewedEvaluated = 0;
  let totalValidated = 0;
  let totalValidatedRejected = 0;
  let totalValidatedEvaluated = 0;

  const processQuestion = (q: Question, parentAnswerContext: any = c.answers, isInsideDynamicList: boolean = false) => {
    let isApplicable = checkIsVisible(q, parentAnswerContext);
    
    // For questions inside dynamic lists, checkIsVisible should technically evaluate against global answers 
    // unless we specifically add support for row-level dependencies.
    if (isInsideDynamicList) {
      isApplicable = checkIsVisible(q, c.answers); 
    }

    if (!isApplicable) return;

    if (q.type === 'dynamic-list') {
      // The list itself
      if (q.required) {
        totalApplicable++;
        const answerArray = c.answers[q.id];
        if (answerArray && answerArray.length > 0) totalAnswered++;
      }
      
      // The rows and their subfields
      const answerArray = c.answers[q.id] || [];
      answerArray.forEach((row: any) => {
        q.subFields?.forEach((subQ: Question) => {
          // If the list is required, all subfields are implicitly required unless overridden. 
          // (User specified: "if dynamic list is required, then all subfields by default are required, still can be overwritten")
          // So we treat subQ.required as true if q.required is true, UNLESS subQ explicitly says required: false.
          // Wait, if subQ.required is boolean, we respect it. If undefined, we inherit.
          const effectiveRequired = subQ.required !== undefined ? subQ.required : !!q.required;
          
          if (effectiveRequired) {
            totalApplicable++;
            const subAnswer = row[subQ.id];
            const hasSubAnswer = subAnswer !== undefined && subAnswer !== null && subAnswer !== '' && (!Array.isArray(subAnswer) || subAnswer.length > 0);
            if (hasSubAnswer) totalAnswered++;
          }
        });
      });
      
      // Reviews and validations for the dynamic list question itself
      if (c.reviews?.[q.id] === 'approved') totalReviewed++;
      if (c.reviews?.[q.id] === 'rejected') totalReviewedRejected++;
      if (c.reviews?.[q.id] === 'approved' || c.reviews?.[q.id] === 'rejected' || c.reviews?.[q.id] === 'read') totalReviewedEvaluated++;
      
      if (c.validations?.[q.id] === 'approved') totalValidated++;
      if (c.validations?.[q.id] === 'rejected') totalValidatedRejected++;
      if (c.validations?.[q.id] === 'approved' || c.validations?.[q.id] === 'rejected') totalValidatedEvaluated++;

    } else if (q.type === 'label') {
      // Labels don't count towards progress
      return;
    } else {
      totalApplicable++;
      const answer = isInsideDynamicList ? parentAnswerContext[q.id] : c.answers[q.id];
      const hasAnswer = answer !== undefined && answer !== null && answer !== '' && (!Array.isArray(answer) || answer.length > 0);
      if (hasAnswer) totalAnswered++;
      
      // Reviews only apply to top-level questions for now
      if (!isInsideDynamicList) {
        if (c.reviews?.[q.id] === 'approved') totalReviewed++;
        if (c.reviews?.[q.id] === 'rejected') totalReviewedRejected++;
        if (c.reviews?.[q.id] === 'approved' || c.reviews?.[q.id] === 'rejected' || c.reviews?.[q.id] === 'read') totalReviewedEvaluated++;
        
        if (c.validations?.[q.id] === 'approved') totalValidated++;
        if (c.validations?.[q.id] === 'rejected') totalValidatedRejected++;
        if (c.validations?.[q.id] === 'approved' || c.validations?.[q.id] === 'rejected') totalValidatedEvaluated++;
      }
    }
  };

  getTabs(config).forEach((tab: any) => {
    getQuestions(tab).forEach((q: any) => processQuestion(q));
  });

  return { totalApplicable, totalAnswered, totalReviewed, totalReviewedRejected, totalReviewedEvaluated, totalValidated, totalValidatedRejected, totalValidatedEvaluated };
};

interface AppState {
  role: Role;
  currentCustomerId: string;
  cases: Record<string, Case>;
  config: any;
  configVersion: number;
  configHistory: Record<number, any>;
  migrationMaps: Record<string, MigrationMap>;
  draftConfig?: any;
}

interface AppContextType extends AppState {
  setRole: (role: Role) => void;
  setCurrentCustomer: (id: string) => void;
  createCase: () => string;
  duplicateCase: (sourceCaseId: string) => string;
  updateCaseStatus: (caseId: string, status: CaseStatus) => void;
  setAnswer: (caseId: string, questionId: string, value: any) => void;
  setValidation: (caseId: string, questionId: string, status: 'approved' | 'rejected' | null) => void;
  addChatMessage: (caseId: string, questionId: string, text: string, options?: { role?: Role, isAI?: boolean, isDraft?: boolean }) => void;
  updateChatMessage: (caseId: string, questionId: string, messageId: string, text: string, isDraft: boolean) => void;
  deleteChatMessage: (caseId: string, questionId: string, messageId: string) => void;
  markChatRead: (caseId: string, questionId: string) => void;
  setAiEvaluation: (caseId: string, questionId: string, recommendation: string, explanation: string) => void;
  importSystemBackup: (backup: any) => void;
  importApplications: (apps: any) => void;
  publishNewConfigVersion: (newConfig: any) => void;
  resetApp: () => void;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (val: boolean) => void;
}

const normalizeQuestion = (q: any): any => {
  if (!q) return q;
  const normalized = { ...q };
  if (normalized.label && !normalized.text) {
    normalized.text = normalized.label;
    delete normalized.label;
  }
  if (normalized.fields && !normalized.subFields) {
    normalized.subFields = normalized.fields;
    delete normalized.fields;
  }
  if (normalized.dependsOn && normalized.dependsOn.questionId !== undefined) {
    const depVal = typeof normalized.dependsOn.value === 'string' 
      ? `"${normalized.dependsOn.value}"` 
      : String(normalized.dependsOn.value);
    normalized.dependsOnExpression = `${normalized.dependsOn.questionId} == ${depVal}`;
    delete normalized.dependsOn;
  }
  if (normalized.type === 'dynamic-list' && Array.isArray(normalized.subFields)) {
    normalized.subFields = normalized.subFields.map((sf: any) => {
      if (typeof sf === 'string') {
        const id = sf.toLowerCase().replace(/\s+/g, '_');
        return { id, text: sf, type: 'text', required: false };
      }
      return normalizeQuestion(sf);
    });
  }
  return normalized;
};

const normalizeConfig = (config: any): any => {
  if (!config) return config;

  let tabsArray = config.tabs;
  if (config.tabs && !Array.isArray(config.tabs)) {
    if (Array.isArray(config.tabs_layout)) {
      tabsArray = config.tabs_layout.map((id: string) => config.tabs[id]).filter(Boolean);
    } else {
      tabsArray = Object.values(config.tabs);
    }
  }

  if (!Array.isArray(tabsArray)) return config;

  return {
    ...config,
    tabs: tabsArray.map((tab: any) => {
      let qs: any[] = [];
      if (Array.isArray(tab.questions)) {
        qs = tab.questions;
      } else if (tab.questions && typeof tab.questions === 'object') {
        if (Array.isArray(tab.layout)) {
          qs = tab.layout.map((id: string) => tab.questions[id]).filter(Boolean);
        } else {
          qs = Object.values(tab.questions);
        }
      }
      return {
        ...tab,
        questions: qs.map(normalizeQuestion)
      };
    })
  };
};

const normalizeConfigHistory = (history: any): any => {
  if (!history) return history;
  const normalized: any = {};
  for (const version in history) {
    if (Object.prototype.hasOwnProperty.call(history, version)) {
      normalized[version] = normalizeConfig(history[version]);
    }
  }
  return normalized;
};

const normalizedInitialConfig = normalizeConfig(initialConfig);

const defaultState: AppState = {
  role: 'customer',
  currentCustomerId: 'cust_1',
  cases: {},
  config: normalizedInitialConfig,
  configVersion: 1,
  configHistory: { 1: normalizedInitialConfig },
  migrationMaps: {},
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(defaultState);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const isReceivingRef = useRef(false);

  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_URL;
    fetch(`${API_BASE_URL}/api/cases`, {
      headers: { 'X-Instance-Id': getInstanceId() }
    }).then(res => res.json()).then(cloudCases => {
      get('compliancePlatformStateV2').then((saved) => {
        let finalCases = saved?.cases || {};
        if (cloudCases && Object.keys(cloudCases).length > 0) {
           finalCases = { ...finalCases, ...cloudCases };
        }
        
        if (saved || Object.keys(finalCases).length > 0) {
          const normalizedCases = { ...finalCases };
          for (const id in normalizedCases) {
            if (normalizedCases[id].customerName === 'Applicant 1') {
              normalizedCases[id] = { ...normalizedCases[id], customerName: 'Applicant' };
            }
          }
          setState({
            ...defaultState,
            ...(saved || {}),
            cases: normalizedCases,
            config: normalizeConfig(saved?.config || defaultState.config),
            configHistory: normalizeConfigHistory(saved?.configHistory || defaultState.configHistory)
          });
        }
        setIsInitialized(true);
      }).catch((e) => {
        console.error("Failed to load state from IndexedDB", e);
        setIsInitialized(true);
      });
    }).catch(e => {
        console.error("Failed to load cases from cloud", e);
        // Fallback to indexedDB only
        get('compliancePlatformStateV2').then((saved) => {
          if (saved) {
            const normalizedCases = { ...saved.cases };
            for (const id in normalizedCases) {
              if (normalizedCases[id].customerName === 'Applicant 1') {
                normalizedCases[id] = { ...normalizedCases[id], customerName: 'Applicant' };
              }
            }
            setState({
              ...defaultState,
              ...saved,
              cases: normalizedCases,
              config: normalizeConfig(saved.config || defaultState.config),
              configHistory: normalizeConfigHistory(saved.configHistory || defaultState.configHistory)
            });
          }
          setIsInitialized(true);
        }).catch(() => setIsInitialized(true));
    });
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    set('compliancePlatformStateV2', state).then(() => {
        // Sync cases to cloud
        const API_BASE_URL = import.meta.env.VITE_API_URL;
        fetch(`${API_BASE_URL}/api/cases`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Instance-Id': getInstanceId() },
            body: JSON.stringify({ cases: state.cases })
        }).catch(e => console.error("Failed to sync cases to cloud", e));
    }).catch((error) => {
      console.warn("Storage quota exceeded, couldn't save state. Try removing large files.", error);
      alert("Warning: Storage quota exceeded. Your latest changes (like large file uploads) could not be saved to your browser. They are still in memory, but will be lost if you refresh.");
    });
  }, [state, isInitialized]);

  // Sync across tabs using BroadcastChannel
  useEffect(() => {
    const channel = new BroadcastChannel('compliance_platform_sync');
    channel.onmessage = (e) => {
      if (e.data?.type === 'STATE_UPDATE') {
        const parsed = e.data.payload;
        isReceivingRef.current = true;
        setState(s => ({
          ...s,
          cases: parsed.cases,
          config: normalizeConfig(parsed.config),
          configVersion: parsed.configVersion,
          configHistory: normalizeConfigHistory(parsed.configHistory || { [parsed.configVersion || 1]: parsed.config }),
          migrationMaps: parsed.migrationMaps
        }));
      }
    };
    return () => channel.close();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    if (isReceivingRef.current) {
      isReceivingRef.current = false;
      return;
    }
    const channel = new BroadcastChannel('compliance_platform_sync');
    channel.postMessage({ type: 'STATE_UPDATE', payload: state });
    return () => channel.close();
  }, [state, isInitialized]);

  const setRole = (role: Role) => setState((s) => ({ ...s, role }));
  
  const setCurrentCustomer = (id: string) => 
    setState((s) => ({ ...s, currentCustomerId: id }));

const generateDefaultAnswers = (config: any) => {
  const answers: Record<string, any> = {};
  config.tabs?.forEach((tab: any) => {
    tab.questions?.forEach((q: any) => {
      if (q.type === 'dynamic-list') {
        const minRows = q.minRows || 0;
        const newArray = [];
        for (let i = 0; i < minRows; i++) newArray.push({});
        answers[q.id] = newArray;
      }
    });
  });
  return answers;
};

  const createCase = () => {
    const id = 'case_' + Math.random().toString(36).substr(2, 9);
    setState((s) => ({
      ...s,
      cases: {
        ...s.cases,
        [id]: {
          id,
          customerId: s.currentCustomerId,
          customerName: 'Applicant',
          status: 'draft',
          answers: generateDefaultAnswers(s.config),
          reviews: {},
          validations: {},
          chats: {},
          changedAnswers: {},
          unreadByStaff: {},
          unreadByCustomer: {},
          aiRecommendations: {},
          aiExplanations: {},
          configVersion: s.configVersion,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
      }
    }));
    return id;
  };

  const duplicateCase = (sourceCaseId: string) => {
    const id = `case_${Math.random().toString(36).substr(2, 9)}`;
    setState((s) => {
      const sourceCase = s.cases[sourceCaseId];
      if (!sourceCase) return s;
      return {
        ...s,
        cases: {
          ...s.cases,
          [id]: {
            id,
            customerId: s.currentCustomerId,
            customerName: sourceCase.customerName,
            status: 'draft',
            answers: JSON.parse(JSON.stringify(sourceCase.answers)),
            reviews: {},
            validations: {},
            chats: {},
            changedAnswers: {},
            unreadByStaff: {},
            unreadByCustomer: {},
            aiRecommendations: {},
            aiExplanations: {},
            configVersion: s.configVersion,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
        }
      };
    });
    return id;
  };

  const updateCaseStatus = (caseId: string, status: CaseStatus) => {
    setState((s) => {
      const c = s.cases[caseId];
      const unreadByStaff = { ...(c.unreadByStaff || {}) };
      if (status === 'submitted' || status === 'reviewed') {
        unreadByStaff['status_validator'] = true;
      }
      
      return {
        ...s,
        cases: {
          ...s.cases,
          [caseId]: {
            ...c,
            status,
            unreadByStaff,
            updatedAt: Date.now()
          }
        }
      };
    });
  };
  
  const setAnswer = (caseId: string, questionId: string, value: any) => 
    setState((s) => {
      const c = s.cases[caseId];
      const isRevision = c.status === 'needs_revision';
      
      // Clear previous evaluations when a customer changes their answer during a revision.
      const newReviews = { ...c.reviews };
      const newValidations = { ...c.validations };
      if (isRevision && c.answers[questionId] !== value) {
        delete newReviews[questionId];
        delete newValidations[questionId];
      }

      return {
        ...s,
        cases: {
          ...s.cases,
          [caseId]: {
            ...c,
            answers: { ...c.answers, [questionId]: value },
            reviews: newReviews,
            validations: newValidations,
            changedAnswers: isRevision ? { ...(c.changedAnswers || {}), [questionId]: true } : c.changedAnswers,
            updatedAt: Date.now()
          }
        }
      };
    });
    
  const setValidation = (caseId: string, questionId: string, status: 'approved' | 'rejected' | null) => 
    setState((s) => ({
      ...s,
      cases: {
        ...s.cases,
        [caseId]: {
          ...s.cases[caseId],
          validations: { ...s.cases[caseId].validations, [questionId]: status },
          updatedAt: Date.now()
        }
      }
    }));

  const setAiEvaluation = (caseId: string, questionId: string, recommendation: string, explanation: string) => 
    setState((s) => ({
      ...s,
      cases: {
        ...s.cases,
        [caseId]: {
          ...s.cases[caseId],
          aiRecommendations: { ...(s.cases[caseId].aiRecommendations || {}), [questionId]: recommendation },
          aiExplanations: { ...(s.cases[caseId].aiExplanations || {}), [questionId]: explanation },
          updatedAt: Date.now()
        }
      }
    }));

  const addChatMessage = (caseId: string, questionId: string, text: string, options?: { role?: Role, isAI?: boolean, isDraft?: boolean }) => {
    setState((s) => {
      const theCase = s.cases[caseId];
      const currentChats = (theCase.chats && theCase.chats[questionId]) || [];
      const newMessage: ChatMessage = {
        id: Math.random().toString(36).substr(2, 9),
        role: options?.role || s.role,
        text,
        timestamp: Date.now(),
        isAI: options?.isAI,
        isDraft: options?.isDraft,
      };
      const isCustomer = s.role === 'customer';
      return {
        ...s,
        cases: {
          ...s.cases,
          [caseId]: {
            ...theCase,
            chats: {
              ...(theCase.chats || {}),
              [questionId]: [...currentChats, newMessage],
            },
            unreadByStaff: isCustomer ? { ...(theCase.unreadByStaff || {}), [questionId]: true } : theCase.unreadByStaff,
            unreadByCustomer: (!isCustomer && !options?.isDraft) ? { ...(theCase.unreadByCustomer || {}), [questionId]: true } : theCase.unreadByCustomer,
            updatedAt: Date.now()
          }
        },
      };
    });
  };

  const updateChatMessage = (caseId: string, questionId: string, messageId: string, text: string, isDraft: boolean) => {
    setState((s) => {
      const theCase = s.cases[caseId];
      if (!theCase) return s;
      const currentChats = (theCase.chats && theCase.chats[questionId]) || [];
      const msgIndex = currentChats.findIndex(m => m.id === messageId);
      if (msgIndex === -1) return s;
      
      const oldMsg = currentChats[msgIndex];
      const newChats = [...currentChats];
      const isPublishing = oldMsg.isDraft && !isDraft;
      newChats[msgIndex] = { 
        ...oldMsg, 
        text, 
        isDraft,
        isAI: isPublishing ? false : oldMsg.isAI,
        role: isPublishing ? s.role : oldMsg.role,
        timestamp: isPublishing ? Date.now() : oldMsg.timestamp
      };

      // Ensure chats are sorted by timestamp (if a message was approved, its timestamp changes)
      newChats.sort((a, b) => a.timestamp - b.timestamp);

      return {
        ...s,
        cases: {
          ...s.cases,
          [caseId]: {
            ...theCase,
            chats: {
              ...(theCase.chats || {}),
              [questionId]: newChats,
            },
            unreadByCustomer: isPublishing ? { ...(theCase.unreadByCustomer || {}), [questionId]: true } : theCase.unreadByCustomer,
            updatedAt: Date.now()
          }
        }
      };
    });
  };

  const deleteChatMessage = (caseId: string, questionId: string, messageId: string) => {
    setState((s) => {
      const theCase = s.cases[caseId];
      if (!theCase) return s;
      const currentChats = (theCase.chats && theCase.chats[questionId]) || [];
      const newChats = currentChats.filter(m => m.id !== messageId);

      return {
        ...s,
        cases: {
          ...s.cases,
          [caseId]: {
            ...theCase,
            chats: {
              ...(theCase.chats || {}),
              [questionId]: newChats,
            },
            updatedAt: Date.now()
          }
        }
      };
    });
  };

  const markChatRead = (caseId: string, questionId: string) => {
    setState((s) => {
      const theCase = s.cases[caseId];
      if (!theCase) return s;
      const isCustomer = s.role === 'customer';
      
      if (isCustomer && !theCase.unreadByCustomer?.[questionId]) return s;
      if (!isCustomer && !theCase.unreadByStaff?.[questionId]) return s;

      return {
        ...s,
        cases: {
          ...s.cases,
          [caseId]: {
            ...theCase,
            unreadByCustomer: isCustomer ? { ...theCase.unreadByCustomer, [questionId]: false } : theCase.unreadByCustomer,
            unreadByStaff: !isCustomer ? { ...theCase.unreadByStaff, [questionId]: false } : theCase.unreadByStaff,
          }
        }
      }
    });
  };

  const importSystemBackup = (backup: any) => {
    const backupConfig = backup.config || backup;
    setState(s => ({
      ...s,
      config: normalizeConfig(backupConfig),
      configVersion: backup.configVersion || 1,
      configHistory: normalizeConfigHistory(backup.configHistory || { 1: backupConfig }),
      migrationMaps: backup.migrationMaps || {},
      draftConfig: undefined
    }));
  };

  const importApplications = (apps: any) => {
    setState(s => ({
      ...s,
      cases: { ...s.cases, ...apps }
    }));
  };

  const publishNewConfigVersion = (newConfig: any) => {
    setState((s) => {
      const normalizedNewConfig = normalizeConfig(newConfig);
      const nextVersion = s.configVersion + 1;
      return {
        ...s,
        configVersion: nextVersion,
        config: normalizedNewConfig,
        configHistory: {
          ...s.configHistory,
          [s.configVersion]: s.config,
          [nextVersion]: normalizedNewConfig
        },
        draftConfig: undefined
      };
    });
  };



  const resetApp = () => setState(defaultState);

  return (
    <AppContext.Provider
      value={{
        ...state,
        setRole,
        setCurrentCustomer,
        createCase,
        duplicateCase,
        updateCaseStatus,
        setAnswer,
        setValidation,
        addChatMessage,
        updateChatMessage,
        deleteChatMessage,
        markChatRead,
        setAiEvaluation,
        importSystemBackup,
        importApplications,
        publishNewConfigVersion,
        resetApp,
        hasUnsavedChanges,
        setHasUnsavedChanges,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};



