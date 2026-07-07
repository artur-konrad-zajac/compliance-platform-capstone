import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext, getCaseProgress } from '../context/AppContext';
import { QuestionChat } from './QuestionChat';
import { checkIsVisible } from '../utils/expressionParser';
import type { Question } from '../context/AppContext';
import { getStatusBadgeClass } from '../utils/styleUtils';
import { getInstanceId } from '../utils/instanceId';
import { formatDateYMD } from '../utils/dateUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { FileIcon, User, UploadCloud, Info, Plus, Trash2, ArrowLeft, AlertTriangle, Download, X, Check, Wand2, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Helper functions for dual-schema support (Legacy Arrays vs New Dictionary+Layout)
const getTabs = (cfg: any) => {
  if (!cfg) return [];
  if (Array.isArray(cfg.tabs)) return cfg.tabs;
  if (cfg.tabs_layout && cfg.tabs) {
    return cfg.tabs_layout.map((id: string) => cfg.tabs[id]).filter(Boolean);
  }
  return [];
};

const getQuestions = (tab: any) => {
  if (!tab) return [];
  if (Array.isArray(tab.questions)) return tab.questions;
  if (tab.layout && tab.questions) {
    return tab.layout.map((id: string) => tab.questions[id]).filter(Boolean);
  }
  return [];
};



pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
export const downloadBase64File = (dataUrl: string, filename: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const QuestionBlock = ({ q, isLastInGroup, applicationData, caseId, setAnswer, isReadOnly, isRevision, isChatReadOnly, addChatMessage, markChatRead, isInvalid, autoFillSuggestion, onAcceptAutoFill, onRejectAutoFill, activeConfig }: any) => {
  const value = applicationData.answers[q.id];

  const renderInput = (q: Question, value: any, onChange: (val: any) => void) => {
    if (q.type === 'label') {
      return (
        <div className="bg-[#F3F4F6] dark:bg-[#1C1C1E]/50 rounded-xl p-4 border border-gray-200 dark:border-[#27272A]">
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{q.text}</p>
        </div>
      );
    }
    
    if (q.type === 'text' || q.type === 'textarea') {
      return (
        <div className="w-full">
          {q.type === 'textarea' ? (
            <textarea
              disabled={isReadOnly}
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={q.placeholder || "Type your answer here..."}
              rows={4}
              className={`w-full bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-slate-500 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-primary-500 transition-shadow resize-y ${isReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
            />
          ) : (
            <input
              type="text"
              disabled={isReadOnly}
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={q.placeholder || ""}
              className={`w-full bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-slate-500 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-primary-500 transition-shadow ${isReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
            />
          )}
        </div>
      );
    }

    if (q.type === 'radio') {
      return (
        <div className="space-y-3">
          {q.options?.map((opt: string) => (
            <div 
              key={opt} 
              onClick={() => { if (!isReadOnly) onChange(opt); }}
              className={`flex items-start space-x-3 ${isReadOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer group'}`}
            >
              <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                value === opt ? 'border-primary-500' : 'border-slate-300 dark:border-slate-600 group-hover:border-primary-400'
              }`}>
                {value === opt && <div className="w-2.5 h-2.5 bg-primary-500 rounded-full" />}
              </div>
              <span className="text-gray-700 dark:text-gray-300 break-words max-w-full text-left leading-relaxed">{opt}</span>
            </div>
          ))}
          {!isReadOnly && value !== undefined && value !== null && (
            <button
              onClick={() => onChange(undefined)}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline mt-2 block"
            >
              Reset Answer
            </button>
          )}
        </div>
      );
    }

    if (q.type === 'checkbox') {
      return (
        <div className="space-y-3">
          {(() => {
            const currentValues = Array.isArray(value) ? value : (value ? [String(value)] : []);

            return q.options?.map((opt: string) => {
              const isChecked = currentValues.includes(opt);
              const disabled = isReadOnly;

              return (
                <div 
                  key={opt} 
                  onClick={() => {
                    if (disabled) return;
                    const newVals = isChecked 
                      ? currentValues.filter((v: string) => v !== opt)
                      : [...currentValues, opt];
                    onChange(newVals);
                  }}
                  className={`flex items-start space-x-3 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer group'}`}
                >
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                    isChecked ? 'bg-primary-500 border-primary-500' : 'border-slate-300 dark:border-slate-600 group-hover:border-primary-400'
                  }`}>
                    {isChecked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <span className="text-gray-700 dark:text-gray-300 break-words max-w-full text-left leading-relaxed">{opt}</span>
                </div>
              );
            });
          })()}
        </div>
      );
    }

    if (q.type === 'file') {
      const isMultiple = q.fileUploadConfig?.multiple;
      const maxFiles = q.fileUploadConfig?.maxFiles;
      const fileList = (isMultiple && Array.isArray(value)) ? value : (value ? [value] : []);

      const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        
        const processFile = (file: File): Promise<{name: string, type: string, size: number, dataUrl: string}> => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              resolve({
                name: file.name,
                type: file.type,
                size: file.size,
                dataUrl: event.target?.result as string
              });
            };
            reader.readAsDataURL(file);
          });
        };

        const newFiles = Array.from(e.target.files);
        Promise.all(newFiles.map(processFile)).then(results => {
          if (isMultiple) {
            let combined = [...fileList, ...results];
            if (maxFiles && combined.length > maxFiles) {
              combined = combined.slice(0, maxFiles);
            }
            onChange(combined);
          } else {
            onChange(results[0]);
          }
        });
      };

      const handleRemove = (indexToRemove: number) => {
        if (isMultiple) {
          onChange(fileList.filter((_: any, i: number) => i !== indexToRemove));
        } else {
          onChange(null);
        }
      };

      return (
        <div className="mt-2">
          {fileList.length > 0 && (
            <div className="space-y-3 mb-4">
              {fileList.map((fileObj: any, idx: number) => {
                // Backward compatibility if value is just a string (name)
                const isLegacyStr = typeof fileObj === 'string';
                const fName = isLegacyStr ? fileObj : fileObj.name;
                const fDataUrl = isLegacyStr ? null : fileObj.dataUrl;

                return (
                  <div key={idx} className="saas-card-panel p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 group hover:ring-1 ring-teal-500/50 transition-all">
                    <div className="space-y-2 flex items-center space-x-3 overflow-hidden">
                      <FileIcon className="w-6 h-6 text-primary-500 shrink-0" />
                      <span className="font-medium text-primary-700 dark:text-primary-300 truncate">{fName}</span>
                    </div>
                    <div className="flex items-center space-x-4 shrink-0">
                      {fDataUrl && (
                        <button 
                          onClick={() => downloadBase64File(fDataUrl, fName)}
                          className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium transition-colors"
                        >
                          <Download className="w-4 h-4" /> <span>Download</span>
                        </button>
                      )}
                      {!isReadOnly && (
                        <button 
                          onClick={() => handleRemove(idx)}
                          className="text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(!isMultiple && fileList.length > 0) || (isMultiple && maxFiles && fileList.length >= maxFiles) ? null : (
            <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 dark:border-[#27272A] rounded-xl ${isReadOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-[#F3F4F6] dark:hover:bg-[#1C1C1E]/50 hover:border-primary-400 transition-colors'}`}>
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <UploadCloud className="w-8 h-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                {isMultiple && <p className="text-xs text-gray-400 mt-1">You can upload multiple files {maxFiles ? `(up to ${maxFiles})` : ''}</p>}
              </div>
              <input type="file" multiple={isMultiple} className="hidden" disabled={isReadOnly} onChange={handleFileChange} />
            </label>
          )}
        </div>
      );
    }

    if (q.type === 'dynamic-list') {
      const listValue = Array.isArray(value) ? value : [];
      const minRows = q.minRows || 0;
      const maxRows = q.maxRows;
      const canDelete = listValue.length > minRows;
      const canAdd = maxRows === undefined || listValue.length < maxRows;

      return (
        <div className="space-y-4">
          {listValue.map((rowItem: any, rowIdx: number) => (
            <div key={rowIdx} className="flex flex-col gap-4 bg-[#F3F4F6] dark:bg-[#0A0A0B]/50 p-4 rounded-xl border border-gray-200 dark:border-[#27272A] relative group hover:z-50 focus-within:z-50">
              {!isReadOnly && canDelete && (
                <button 
                  onClick={() => {
                    const newArray = [...listValue];
                    newArray.splice(rowIdx, 1);
                    onChange(newArray);
                  }}
                  className="absolute top-2 right-2 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors md:opacity-0 md:group-hover:opacity-100"
                  title="Remove row"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {q.subFields?.map((subQ: Question) => (
                  <div key={subQ.id} className="flex flex-col">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {subQ.text}
                      {subQ.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderInput(subQ, rowItem[subQ.id], (newVal) => {
                      const newArray = [...listValue];
                      newArray[rowIdx] = { ...newArray[rowIdx], [subQ.id]: newVal };
                      onChange(newArray);
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          {!isReadOnly && canAdd && (
            <button 
              onClick={() => {
                const newArray = [...listValue, {}];
                onChange(newArray);
              }}
              className="flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 px-2 py-2 border border-dashed border-primary-300 dark:border-primary-700 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors w-full justify-center"
            >
              <Plus className="w-4 h-4" /> Add Row
            </button>
          )}
        </div>
      );
    }
    
    return null;
  };

  const isRejected = applicationData.validations?.[q.id] === 'rejected' || applicationData.reviews?.[q.id] === 'rejected';
  
  return (
    <div key={q.id} className={`py-6 ${!isLastInGroup && !isInvalid ? 'border-b border-gray-200 dark:border-[#27272A]' : ''} ${isInvalid ? 'bg-red-50/50 dark:bg-red-900/10 px-4 -mx-4 rounded-xl border-2 border-red-300 dark:border-red-800 my-2 shadow-sm shadow-red-500/10' : ''}`}>
      {q.type !== 'label' && (
        <label className="flex items-center text-lg font-medium text-gray-800 dark:text-gray-200 mb-4">
          {q.text}
          {q.required && <span className="text-red-500 ml-1">*</span>}
          {isRevision && isRejected && (
            <span className="ml-3 px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded text-xs font-bold uppercase tracking-wider">
              Requires Revision
            </span>
          )}
          {q.tooltip && (
            <div className="relative group flex items-center ml-2 cursor-help">
              <Info className="w-4 h-4 text-gray-400 hover:text-primary-500 transition-colors" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 p-3 bg-[#1C1C1E] dark:bg-slate-700 text-white text-xs rounded-lg shadow-xl z-50 whitespace-normal">
                {q.tooltip}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1C1C1E] dark:bg-slate-700 rotate-45"></div>
              </div>
            </div>
          )}
        </label>
      )}
      
      {renderInput(q, value, (val) => setAnswer(caseId, q.id, val))}
      
      {autoFillSuggestion && (
        <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/10 border-2 border-purple-200 dark:border-purple-800 rounded-xl relative shadow-sm">
          <div className="absolute top-4 right-4 flex gap-2">
            <button onClick={onRejectAutoFill} className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors" title="Reject">
              <X className="w-5 h-5" />
            </button>
            <button onClick={onAcceptAutoFill} className="p-1.5 text-purple-600 hover:text-white bg-white hover:bg-purple-600 dark:bg-purple-900/50 dark:text-purple-300 dark:hover:bg-purple-500 dark:hover:text-white rounded-lg transition-colors border border-purple-200 dark:border-purple-700 hover:border-transparent" title="Accept">
              <Check className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <Wand2 className="w-4 h-4 text-purple-500" />
            <h4 className="font-semibold text-purple-800 dark:text-purple-300 text-sm">AI Suggestion</h4>
          </div>
          {value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0) ? (
            <div className="mb-2">
              <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Current Answer:</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 line-through opacity-70 mt-0.5">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </p>
            </div>
          ) : null}
          <div>
            <span className="text-xs text-purple-600 dark:text-purple-400 uppercase font-bold tracking-wider">Proposed Answer:</span>
            <p className="text-base text-gray-900 dark:text-white font-medium mt-0.5 whitespace-pre-wrap">
              {typeof autoFillSuggestion.answer === 'object' ? JSON.stringify(autoFillSuggestion.answer, null, 2) : String(autoFillSuggestion.answer)}
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-purple-200/50 dark:border-purple-800/50 text-[10px] text-purple-700 dark:text-purple-400 italic">
            Disclaimer: This is an AI-generated response. It may contain inaccuracies.
          </div>
          {autoFillSuggestion.citation && (
            <div className="mt-3 text-xs text-purple-600/80 dark:text-purple-400/80 border-t border-purple-200/50 dark:border-purple-800/50 pt-2">
              <span className="font-semibold">Citation:</span> {autoFillSuggestion.citation}
            </div>
          )}
        </div>
      )}
      
      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
        <QuestionChat 
          messages={(applicationData.chats?.[q.id] || []).filter((m: any) => !m.isDraft)}
          onSend={(text) => addChatMessage(caseId, q.id, text)} 
          allowAskAI={true}
          onSendAI={async (text) => {
            addChatMessage(caseId, q.id, text);
            try {
              const currentChats = applicationData.chats?.[q.id] || [];
              const chatHistory = currentChats.filter((m: any) => !m.isDraft).map((m: any) => ({
                  role: m.role === 'customer' ? 'user' : (m.role === 'ai' ? 'assistant' : 'reviewer'),
                  text: m.text
              }));
              
              let globalContext = undefined;
              if (text.toLowerCase().includes('@all') || text.toLowerCase().includes('@chat')) {
                  globalContext = JSON.stringify({
                      answers: applicationData.answers,
                      all_chats: applicationData.chats
                  });
              }

              const res = await fetch((import.meta.env.VITE_API_URL) + "/api/ask-ai", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Instance-Id": getInstanceId() },
                body: JSON.stringify({ 
                    question: text, 
                    context: q.text,
                    chat_history: chatHistory,
                    global_context: globalContext,
                    celex_id: activeConfig.celex_id
                })
              });
              const data = await res.json();
              if (data.status === 'success' && data.response) {
                addChatMessage(caseId, q.id, data.response, { role: 'ai' as any, isAI: true });
              }
            } catch (e) {
              console.error(e);
            }
          }}
          isReadOnly={isChatReadOnly}
          hasUnread={applicationData.unreadByCustomer?.[q.id] || false}
          onOpen={() => markChatRead(caseId, q.id)}
        />
      </div>
    </div>
  );
};

export const ApplicantForm: React.FC = () => {
  const { config, configHistory, currentCustomerId, cases, createCase, duplicateCase, updateCaseStatus, setAnswer, addChatMessage, markChatRead } = useAppContext();
  
  const customerCases = Object.values(cases)
    .filter(c => c.customerId === currentCustomerId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const activeCases = customerCases.filter(c => c.status !== 'concluded');
  const historyCases = customerCases.filter(c => c.status === 'concluded');

  const [caseId, setCaseId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [autoFillSuggestions, setAutoFillSuggestions] = useState<Record<string, any>>({});
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  const lastCaseIdRef = React.useRef<string | null>(null);

  // Default-select the first tab when a case is opened
  useEffect(() => {
    if (caseId) {
      const activeCase = cases[caseId];
      if (activeCase) {
        const cConfig = configHistory?.[activeCase.configVersion || 1] || config;
        const isNewCase = caseId !== lastCaseIdRef.current;

        if (getTabs(cConfig).length > 0) {
          setActiveTab(prev => {
            const isValid = prev && getTabs(cConfig).some((t: any) => t.id === prev);
            if (isNewCase || !isValid) {
              return getTabs(cConfig)[0].id;
            }
            return prev;
          });
        }
      }
    }
    lastCaseIdRef.current = caseId;
  }, [caseId, cases, config, configHistory]);

  const activeElementRef = React.useRef<Element | null>(null);
  const lastActiveElementTopRef = React.useRef<number>(0);

  const captureScrollAnchor = () => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.closest('button') || activeEl.closest('label'))) {
      activeElementRef.current = activeEl;
      lastActiveElementTopRef.current = activeEl.getBoundingClientRect().top;
    }
  };

  React.useLayoutEffect(() => {
    if (activeElementRef.current && document.body.contains(activeElementRef.current)) {
      const newTop = activeElementRef.current.getBoundingClientRect().top;
      const diff = newTop - lastActiveElementTopRef.current;
      if (Math.abs(diff) > 0.5) {
        const scrollContainer = document.querySelector('main');
        if (scrollContainer) {
          scrollContainer.scrollTop += diff;
        }
      }
    }
    activeElementRef.current = null;
  });

  useEffect(() => {
    const handleCapture = () => {
      captureScrollAnchor();
    };
    
    document.addEventListener('click', handleCapture, true);
    document.addEventListener('input', handleCapture, true);
    document.addEventListener('change', handleCapture, true);
    
    return () => {
      document.removeEventListener('click', handleCapture, true);
      document.removeEventListener('input', handleCapture, true);
      document.removeEventListener('change', handleCapture, true);
    };
  }, []);

  useEffect(() => {
    setCaseId(null);
  }, [currentCustomerId]);

  const startNewCase = () => {
    const newId = createCase();
    setCaseId(newId);
  };

  // DASHBOARD VIEW
  if (!caseId) {
    return (
      <div className="space-y-6">
        <div className="saas-card p-8 md:p-10 text-center space-y-6 max-w-2xl mx-auto">
          <div className="w-20 h-20 bg-gradient-to-tr from-primary-600 to-primary-400 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-primary-500/30">
            <User className="w-10 h-10 text-white" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Applicant Dashboard</h2>
            <p className="text-gray-500 dark:text-gray-400 text-lg">Welcome back! Manage your applications here.</p>
          </div>
          <button 
            onClick={startNewCase}
            className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white font-semibold rounded-xl shadow-lg shadow-primary-500/25 transition-all transform hover:scale-105 active:scale-95"
          >
            Start New Application
          </button>
        </div>

        {activeCases.length > 0 && (
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 border-b border-gray-200 dark:border-[#27272A] pb-2">
              Active Applications
            </h3>
            <div className="saas-card rounded-2xl overflow-x-hidden md:overflow-x-auto p-4 md:p-0 border border-primary-200 dark:border-primary-800">
              <table className="block md:table w-full text-left border-collapse">
                <thead className="hidden md:table-header-group">
                  <tr className="bg-slate-100/50 dark:bg-[#1C1C1E]/50 border-b border-gray-200 dark:border-[#27272A]">
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">ID</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-center">Status</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Version</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Progress</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Created</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Updated</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="block md:table-row-group">
                  {activeCases.map(activeCase => {
                    const cConfig = configHistory?.[activeCase.configVersion || 1] || config;
                    const { totalApplicable, totalAnswered } = getCaseProgress(activeCase, cConfig);
                    return (
                    <tr key={activeCase.id} className="block md:table-row bg-slate-50 dark:bg-[#0A0A0B] md:bg-transparent md:border-b border-gray-200 dark:border-[#27272A] hover:bg-slate-100/80 dark:hover:bg-[#1C1C1E]/30 transition-colors mb-4 md:mb-0 rounded-xl md:rounded-none border shadow-sm md:shadow-none overflow-hidden">
                      <td className="p-4 text-sm font-mono text-gray-500 dark:text-gray-400 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">ID</span>
                        <div className="flex flex-col items-start gap-1">
                          <span>{activeCase.id}</span>
                          {Object.values(activeCase.unreadByCustomer || {}).some(v => v) && (
                            <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full animate-pulse uppercase whitespace-nowrap">
                              New Msg
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none text-center">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Status</span>
                        <span className={`inline-block align-middle px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusBadgeClass(activeCase.status)}`}>
                          {activeCase.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-4 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Version</span>
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          v{activeCase.configVersion || 1}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-600 dark:text-gray-300 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Progress</span>
                        <span className="whitespace-nowrap">{totalAnswered} / {totalApplicable} Answered</span>
                      </td>
                      <td className="p-4 text-xs text-gray-500 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Created</span>
                        <span>{formatDateYMD(new Date())}</span>
                      </td>
                      <td className="p-4 text-xs text-gray-500 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Updated</span>
                        <span>{formatDateYMD(new Date())}</span>
                      </td>
                      <td className="p-4 text-right flex gap-4 justify-between items-center md:table-cell bg-[#F3F4F6] dark:bg-[#1C1C1E]/50 md:bg-transparent dark:md:bg-transparent">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Action</span>
                        <button 
                          onClick={() => { setCaseId(activeCase.id); setActiveTab(getTabs(config)[0]?.id); }}
                          className="w-full md:w-36 text-center whitespace-nowrap px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          {activeCase.status === 'draft' || activeCase.status === 'needs_revision' ? 'Continue' : 'View Status'}
                        </button>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {historyCases.length > 0 && (
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 border-b border-gray-200 dark:border-[#27272A] pb-2">
              Application History
            </h3>
            <div className="saas-card rounded-2xl overflow-x-hidden md:overflow-x-auto p-4 md:p-0">
              <table className="block md:table w-full text-left border-collapse">
                <thead className="hidden md:table-header-group">
                  <tr className="bg-slate-100/50 dark:bg-[#1C1C1E]/50 border-b border-gray-200 dark:border-[#27272A]">
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">ID</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-center">Status</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Version</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Progress</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Created</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Updated</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="block md:table-row-group">
                  {historyCases.map(c => {
                    const cConfig = configHistory?.[c.configVersion || 1] || config;
                    const { totalApplicable, totalAnswered } = getCaseProgress(c, cConfig);
                    return (
                    <tr key={c.id} className="block md:table-row bg-slate-50 dark:bg-[#0A0A0B] md:bg-transparent md:border-b border-gray-200 dark:border-[#27272A] hover:bg-slate-100/80 dark:hover:bg-[#1C1C1E]/30 transition-colors mb-4 md:mb-0 rounded-xl md:rounded-none border shadow-sm md:shadow-none overflow-hidden">
                      <td className="p-4 text-sm font-mono text-gray-500 dark:text-gray-400 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">ID</span>
                        {c.id}
                      </td>
                      <td className="p-4 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none text-center">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Status</span>
                        <span className={`inline-block align-middle px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusBadgeClass(c.status)}`}>
                          {c.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-4 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Version</span>
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          v{c.configVersion || 1}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-600 dark:text-gray-300 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Progress</span>
                        <span className="whitespace-nowrap">{totalAnswered} / {totalApplicable} Answered</span>
                      </td>
                      <td className="p-4 text-xs text-gray-500 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Created</span>
                        <span>{formatDateYMD(new Date())}</span>
                      </td>
                      <td className="p-4 text-xs text-gray-500 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Updated</span>
                        <span>{formatDateYMD(new Date())}</span>
                      </td>
                      <td className="p-4 text-right flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:table-cell bg-[#F3F4F6] dark:bg-[#1C1C1E]/50 md:bg-transparent dark:md:bg-transparent">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Action</span>
                        <div className="flex flex-col gap-2 items-end">
                          <button 
                            onClick={() => { setCaseId(c.id); setActiveTab(getTabs(config)[0]?.id); }}
                            className="w-full md:w-36 text-center whitespace-nowrap px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
                          >
                            View Status
                          </button>
                          <button 
                            onClick={() => {
                              if(window.confirm('Start a new application using answers from this concluded case?')) {
                                const newId = duplicateCase(c.id);
                                setCaseId(newId);
                                setActiveTab(getTabs(config)[0]?.id);
                              }
                            }}
                            className="w-full md:w-36 text-center whitespace-nowrap px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
                          >
                            Re-initialize
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // FORM VIEW
  const applicationData = cases[caseId];
  if (!applicationData) return null;

  const activeCaseVersion = applicationData.configVersion || 1;
  const activeConfig = (configHistory && configHistory[activeCaseVersion]) ? configHistory[activeCaseVersion] : config;

  const currentTabObj = activeTab === null ? null : (getTabs(activeConfig).find((t: any) => t.id === activeTab) || getTabs(activeConfig)[0]);
  
  const visibleQuestions = getQuestions(currentTabObj).filter((q: any) => checkIsVisible(q, applicationData.answers)) || [];

  const isReadOnly = ['submitted', 'in_review', 'reviewed', 'validated', 'rejected', 'concluded'].includes(applicationData.status);
  const isRevision = applicationData.status === 'needs_revision';
  const isChatReadOnly = applicationData.status === 'concluded';

  const handleSubmit = () => {
    let allValid = true;
    const errors: string[] = [];

    getTabs(activeConfig).forEach((tab: any) => {
      getQuestions(tab).forEach((q: any) => {
        const isVisible = checkIsVisible(q, applicationData.answers);
        if (isVisible && q.required) {
          const val = applicationData.answers[q.id];
          if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
            allValid = false;
            errors.push(q.id);
          }
        }
      });
    });

    if (allValid) {
      setValidationErrors([]);
      updateCaseStatus(caseId, 'submitted');
      setCaseId(null); // Go back to dashboard
    } else {
      setValidationErrors(errors);
      // Auto-switch to first tab with errors
      const firstTabWithError = getTabs(activeConfig).find((tab: any) => getQuestions(tab).some((q: any) => errors.includes(q.id)));
      if (firstTabWithError) setActiveTab(firstTabWithError.id);
    }
  };

  const handleAutoFillUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsAutoFilling(true);
    try {
      let text = "";
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(" ");
          text += `[Page ${i}] ${pageText}\n`;
        }
      } else {
        text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const rawText = event.target?.result as string;
            const lines = rawText.split('\\n');
            const numberedText = lines.map((line, index) => `[Line ${index + 1}] ${line}`).join('\\n');
            resolve(numberedText);
          };
          reader.onerror = reject;
          reader.readAsText(file);
        });
      }

      const schemaFields: any[] = [];
      getTabs(activeConfig).forEach((t: any) => {
        getQuestions(t).forEach((q: any) => {
          if (q.type === 'dynamic-list') {
            schemaFields.push({ 
              id: q.id, 
              text: q.text, 
              type: 'dynamic-list (answer MUST be a JSON array of objects. Each object represents a row and MUST use the subField IDs as keys)', 
              subFields: q.subFields?.map((sq: any) => ({ id: sq.id, text: sq.text, type: sq.type, options: sq.options }))
            });
          } else {
            schemaFields.push({ id: q.id, text: q.text, type: q.type, options: q.options });
          }
        });
      });
      
      const res = await fetch((import.meta.env.VITE_API_URL) + "/api/auto-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Instance-Id": getInstanceId() },
        body: JSON.stringify({ document_text: text, form_schema: JSON.stringify(schemaFields) })
      });
      const data = await res.json();
      if (data.status === 'success' && data.auto_filled_answers) {
         let cleanStr = data.auto_filled_answers;
         const match = cleanStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
         if (match) {
           cleanStr = match[1].trim();
         } else {
           const firstBracket = cleanStr.indexOf('[');
           const lastBracket = cleanStr.lastIndexOf(']');
           if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
             cleanStr = cleanStr.substring(firstBracket, lastBracket + 1);
           }
         }
         let parsed: any = [];
         try {
           parsed = JSON.parse(cleanStr);
         } catch (e: any) {
           console.error("Failed to parse agent JSON:", e, cleanStr);
           alert("The AI generated an invalid response. Error: " + e.message + "\n\nPayload preview: " + cleanStr.substring(0, 100));
           setIsAutoFilling(false);
           return;
         }
         
         const suggestionsMap: Record<string, any> = {};
         if (Array.isArray(parsed)) {
           parsed.forEach(item => {
             if (item.id && item.answer !== undefined && item.answer !== null && item.answer !== '') {
               // Validate that the AI-provided ID actually exists in the current schema
               let idExists = false;
               getTabs(activeConfig).forEach((t: any) => {
                 if (getQuestions(t).some((q: any) => q.id === item.id)) idExists = true;
               });
               
               if (!idExists) return;

               if (Array.isArray(item.answer) && item.answer.length === 0) return;
               if (typeof item.answer === 'object' && !Array.isArray(item.answer) && Object.keys(item.answer).length === 0) return;
               
               const ansStr = String(item.answer).trim().toUpperCase();
               if (ansStr.startsWith('NOT_FOUND') || ansStr.startsWith('NOT FOUND') || ansStr === 'NOT_FOUND') return;
               
               suggestionsMap[item.id] = item;
             }
           });
         }
         if (Object.keys(suggestionsMap).length === 0) {
           alert("The AI could not find any answers in the provided document that match the form questions.");
         } else {
           setAutoFillSuggestions(suggestionsMap);
         }
      } else {
         alert("Auto-Fill failed: " + (data.detail || data.message || "Unknown error"));
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to Auto-Fill service or parse document.");
    } finally {
      setIsAutoFilling(false);
      e.target.value = '';
    }
  };
  
  const handleAcceptAutoFill = (qId: string) => {
    const suggestion = autoFillSuggestions[qId];
    if (suggestion) {
      // Find the question in activeConfig to know its type and options
      let qObj: any = null;
      getTabs(activeConfig).forEach((t: any) => {
        const found = getQuestions(t).find((q: any) => q.id === qId);
        if (found) qObj = found;
      });

      let finalValue = suggestion.answer;
      if (typeof finalValue === 'string') {
        finalValue = finalValue.replace("Disclaimer: This is an AI-generated response. It may contain inaccuracies. Please verify with official documentation.", "").trim();
      }

      if (qObj) {
        if (qObj.type === 'radio' && qObj.options) {
          const valLower = String(finalValue).toLowerCase().trim();
          const match = qObj.options.find((opt: string) => {
            const optLower = opt.toLowerCase().trim();
            return optLower === valLower || valLower.includes(optLower);
          });
          if (match) {
            finalValue = match;
          } else {
            finalValue = undefined;
          }
        } else if (qObj.type === 'checkbox' && qObj.options) {
          let valuesArray: string[] = [];
          if (Array.isArray(finalValue)) {
            valuesArray = finalValue.map(v => String(v).toLowerCase().trim());
          } else if (typeof finalValue === 'string') {
            valuesArray = finalValue.split(',').map(s => s.toLowerCase().trim());
          }
          
          const matchedOptions = qObj.options.filter((opt: string) => {
            const optLower = opt.toLowerCase().trim();
            return valuesArray.some(v => v === optLower || v.includes(optLower));
          });
          
          if (matchedOptions.length > 0) {
            finalValue = matchedOptions;
          } else {
            finalValue = undefined;
          }
        }
      }

      if (finalValue === undefined) {
        alert("The AI proposed an answer that does not match any of the available options.");
        setAutoFillSuggestions(prev => {
          const newSuggestions = { ...prev };
          delete newSuggestions[qId];
          return newSuggestions;
        });
        return;
      }

      setAnswer(caseId!, qId, finalValue);
      setAutoFillSuggestions(prev => {
        const newSuggestions = { ...prev };
        delete newSuggestions[qId];
        return newSuggestions;
      });
    }
  };

  const handleRejectAutoFill = (qId: string) => {
    setAutoFillSuggestions(prev => {
      const newSuggestions = { ...prev };
      delete newSuggestions[qId];
      return newSuggestions;
    });
  };

  return (
    <div className="space-y-8 pb-20">

      <div className={`saas-card rounded-2xl p-6 md:p-8 border-l-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 ${isReadOnly ? 'border-l-slate-500' : isRevision ? 'border-l-amber-500' : 'border-l-primary-500'}`}>
        <div>
          <button 
            onClick={() => { setCaseId(null); setAutoFillSuggestions({}); }}
            className="flex items-center space-x-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
          
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Compliance Form
            {isReadOnly && <span className="ml-3 text-sm font-normal px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded text-gray-600 dark:text-gray-300">Read Only</span>}
          </h2>
          
          {isRevision ? (
            <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400 mt-2">
              <AlertTriangle className="w-5 h-5" />
              <p className="font-medium">Action Required: The reviewer or validator has requested changes to some of your answers.</p>
            </div>
          ) : isReadOnly ? (
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Status: <span className="font-bold uppercase tracking-wider">{applicationData.status.replace('_', ' ')}</span>
            </p>
          ) : (
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Please fill out all the sections. Your progress is saved automatically.
            </p>
          )}
        </div>
        

          <div className="flex flex-col gap-3 w-full md:w-auto">
            {!isReadOnly && (
              <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                <label className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 font-semibold rounded-xl shadow-sm transition-colors cursor-pointer ${isAutoFilling ? 'opacity-50 pointer-events-none' : ''}`}>
                  {isAutoFilling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                  <span className="whitespace-nowrap">{isAutoFilling ? 'Analyzing...' : 'Auto-Fill (.txt, .pdf)'}</span>
                  <input type="file" accept=".txt,.pdf" className="hidden" onChange={handleAutoFillUpload} disabled={isAutoFilling} />
                </label>
                <button 
                  onClick={handleSubmit}
                  className={`flex-1 md:flex-none px-8 py-3 text-white font-semibold rounded-xl shadow-lg transition-all ${isRevision ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30' : 'bg-gradient-to-r from-primary-600 to-primary-500 hover:scale-105 shadow-primary-500/30'}`}
                >
                  {isRevision ? 'Resubmit' : 'Submit'}
                </button>
              </div>
            )}
            {Object.keys(autoFillSuggestions).length > 0 && (
              <div className="w-full bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-3 flex flex-col md:flex-row items-center justify-between mt-1 gap-3">
                <div className="flex flex-col text-center md:text-left">
                  <span className="text-sm font-medium text-purple-800 dark:text-purple-300">
                    {Object.keys(autoFillSuggestions).length} Suggestion(s)
                  </span>
                  <span className="text-[10px] text-purple-700/80 dark:text-purple-400/80 italic mt-0.5">
                    Disclaimer: These are AI-generated responses. They may contain inaccuracies.
                  </span>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <button onClick={() => setAutoFillSuggestions({})} className="flex-1 md:flex-none text-xs font-semibold px-3 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition-colors">
                    Reject All
                  </button>
                  <button onClick={() => {
                    Object.keys(autoFillSuggestions).forEach(qId => handleAcceptAutoFill(qId));
                  }} className="flex-1 md:flex-none text-xs font-semibold px-3 py-2 text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm transition-colors">
                    Accept All
                  </button>
                </div>
              </div>
            )}
          </div>
      </div>

      <div className="saas-card rounded-2xl p-6 border border-gray-200 dark:border-[#27272A]">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">General Case Discussion</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Have a general question about this application? Ask it here.</p>
        <QuestionChat 
          title="General Discussion"
          messages={(applicationData.chats?.['general'] || []).filter((m: any) => !m.isDraft)}
          onSend={(text) => addChatMessage(caseId, 'general', text)} 
          allowAskAI={true}
          onSendAI={async (text) => {
            addChatMessage(caseId, 'general', text);
            try {
              const currentChats = applicationData.chats?.['general'] || [];
              const chatHistory = currentChats.filter((m: any) => !m.isDraft).map((m: any) => ({
                  role: m.role === 'customer' ? 'user' : (m.role === 'ai' ? 'assistant' : 'reviewer'),
                  text: m.text
              }));

              let globalContext = undefined;
              if (text.toLowerCase().includes('@all') || text.toLowerCase().includes('@chat')) {
                  globalContext = JSON.stringify({
                      answers: applicationData.answers,
                      all_chats: applicationData.chats
                  });
              }

              const res = await fetch((import.meta.env.VITE_API_URL) + "/api/ask-ai", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Instance-Id": getInstanceId() },
                body: JSON.stringify({ 
                    question: text, 
                    context: "General Application Context",
                    chat_history: chatHistory,
                    global_context: globalContext,
                    celex_id: activeConfig.celex_id
                })
              });
              const data = await res.json();
              if (data.status === 'success' && data.response) {
                addChatMessage(caseId, 'general', data.response, { role: 'ai' as any, isAI: true });
              }
            } catch (e) {
              console.error(e);
            }
          }}
          isReadOnly={isChatReadOnly}
          hasUnread={applicationData.unreadByCustomer?.['general'] || false}
          onOpen={() => markChatRead(caseId, 'general')}
        />
      </div>

      <div className="w-full">
        {/* Tab Content */}
        <div className="flex-1 space-y-6">
          {visibleQuestions.map((q: any, index: number) => {
            return (
              <motion.div 
                key={q.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="saas-card rounded-2xl px-6 relative hover:z-50 focus-within:z-50"
              >
                <QuestionBlock 
                  q={q} 
                  isLastInGroup={true} 
                  applicationData={applicationData}
                  caseId={caseId}
                  setAnswer={setAnswer}
                  isReadOnly={isReadOnly}
                  isRevision={isRevision}
                  isChatReadOnly={isChatReadOnly}
                  addChatMessage={addChatMessage}
                  markChatRead={markChatRead}
                  isInvalid={validationErrors.includes(q.id)}
                  autoFillSuggestion={autoFillSuggestions[q.id]}
                  onAcceptAutoFill={() => handleAcceptAutoFill(q.id)}
                  onRejectAutoFill={() => handleRejectAutoFill(q.id)}
                  activeConfig={activeConfig}
                />
              </motion.div>
            );
          })}

          {visibleQuestions.length === 0 && (
            <div className="saas-card rounded-2xl p-12 text-center text-gray-500">
              No applicable questions in this section based on your previous answers.
            </div>
          )}
        </div>
      </div>

      {/* Forms Tab Backdrop */}
      {createPortal(
        <>
          <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-[#0A0A0B]/60 backdrop-blur-sm z-[9998]"
          />
        )}
      </AnimatePresence>

      {/* Forms Tab Slide-out Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-[350px] bg-white dark:bg-[#1C1C1E] border-l border-gray-200 dark:border-[#27272A] shadow-2xl z-[9999] flex flex-col p-5"
          >
            <div className="flex items-center justify-between mb-4 shrink-0 border-b border-gray-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-gray-800 dark:text-gray-200">Form Tabs</h3>
            </div>
            
            {/* Tab List - Scrollable */}
            <div 
              className="flex-grow overflow-y-auto no-scrollbar space-y-2.5 pr-1 -mr-1 mb-4"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {(getTabs(activeConfig) || []).map((tab: any) => {
                const hasUnreadInTab = getQuestions(tab).some((q: any) => applicationData.unreadByCustomer?.[q.id]);
                const hasErrorsInTab = getQuestions(tab).some((q: any) => validationErrors.includes(q.id));
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(activeTab === tab.id ? null : tab.id); setIsSidebarOpen(false); }}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all font-medium flex justify-between items-center ${
                      activeTab === tab.id 
                        ? 'bg-primary-600 text-white shadow-md shadow-primary-600/30' 
                        : hasErrorsInTab
                          ? 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/50'
                          : 'bg-gray-50 dark:bg-[#0A0A0B] border border-gray-255/50 dark:border-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-855'
                    }`}
                  >
                    <span className="font-semibold break-words flex-1 mr-2 text-sm text-left">{tab.title}</span>
                    {hasErrorsInTab && (
                      <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ml-1 ${activeTab === tab.id ? 'text-white' : 'text-red-500 animate-pulse'}`} />
                    )}
                    {hasUnreadInTab && (
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ml-1 ${activeTab === tab.id ? 'bg-white' : 'bg-red-500'}`} />
                    )}
                  </button>
                );
              })}
            </div>
            
            {/* Bottom buttons - Pinned at the bottom of the drawer */}
            <div className="flex flex-col gap-2 pt-4 border-t border-gray-100 dark:border-slate-800 shrink-0">
              <button 
                onClick={() => setIsSidebarOpen(false)} 
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold shadow-md transition-colors text-sm cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Close Sidebar</span>
              </button>
            </div>
          </motion.div>
        )}
          </AnimatePresence>
        </>,
        document.body
      )}

      {/* Vertical tab pinned to the right edge when sidebar is closed */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className={`flex fixed right-0 top-64 md:top-1/2 md:-translate-y-1/2 z-[9990] text-white rounded-l-md py-6 px-2.5 shadow-md flex-col items-center justify-center border border-r-0 cursor-pointer select-none transition-colors ${
            validationErrors.length > 0
              ? 'bg-red-600 hover:bg-red-500 border-red-400/20 animate-pulse'
              : 'bg-primary-600 hover:bg-primary-500 border-primary-400/20'
          }`}
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          <span className="font-bold tracking-wider text-xs uppercase">Form Tabs</span>
        </button>
      )}
    </div>
  );
};



