"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
var client_1 = require("@prisma/client");
var prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var rules, _loop_1, _i, rules_1, rule;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('Starting migration of legacy automation rules to Event-Driven Graph format...');
                    return [4 /*yield*/, prisma.automationRule.findMany({
                            where: {
                                // @ts-ignore
                                eventType: null
                            }
                        })];
                case 1:
                    rules = _a.sent();
                    console.log("Found ".concat(rules.length, " legacy rules to migrate."));
                    _loop_1 = function (rule) {
                        var actions, nodes_1, edges_1, timestamp_1, triggerId, previousNodeId_1, currentY_1, newFlowDefinition, err_1;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 4, , 5]);
                                    actions = rule.actions || [];
                                    if (!(!Array.isArray(actions) || actions.length === 0)) return [3 /*break*/, 2];
                                    console.log("Rule ".concat(rule.id, " has no legacy actions. Updating event metadata."));
                                    return [4 /*yield*/, prisma.automationRule.update({
                                            where: { id: rule.id },
                                            data: {
                                                eventType: 'message_received',
                                                isActive: true,
                                                // Initialize empty graph if null
                                                flowDefinition: rule.flowDefinition || { nodes: [], edges: [] }
                                            }
                                        })];
                                case 1:
                                    _b.sent();
                                    return [2 /*return*/, "continue"];
                                case 2:
                                    nodes_1 = [];
                                    edges_1 = [];
                                    timestamp_1 = Date.now().toString(36);
                                    triggerId = "trigger-legacy-".concat(timestamp_1);
                                    nodes_1.push({
                                        id: triggerId,
                                        type: 'trigger',
                                        position: { x: 250, y: 100 },
                                        data: {
                                            label: 'Incoming WhatsApp Message',
                                            description: 'Triggered when a message is received on this Workspace',
                                            eventType: 'message_received'
                                        }
                                    });
                                    previousNodeId_1 = triggerId;
                                    currentY_1 = 250;
                                    // 2. Map Actions to generic Flow Action Nodes
                                    actions.forEach(function (action, i) {
                                        var nodeId = "node-legacy-".concat(i, "-").concat(timestamp_1);
                                        var label = 'Action';
                                        if (action.type === 'SEND_WHATSAPP')
                                            label = 'Send Message';
                                        if (action.type === 'DELAY')
                                            label = 'Time Delay';
                                        if (action.type === 'WEBHOOK')
                                            label = 'HTTP Webhook';
                                        if (action.type === 'ADD_TAG')
                                            label = 'Assign Tag';
                                        nodes_1.push({
                                            id: nodeId,
                                            type: 'action', // Ensure we use custom Flow builder action components
                                            position: { x: 250, y: currentY_1 },
                                            data: {
                                                label: label,
                                                // Map legacy payloads transparently into the node data schema
                                                actionType: action.type,
                                                messageContent: action.messageContent || '',
                                                templateId: action.templateId || null,
                                                delayMinutes: action.minutes ? action.minutes.toString() : '1',
                                                webhookUrl: action.webhookUrl || ''
                                            }
                                        });
                                        edges_1.push({
                                            id: "edge-".concat(previousNodeId_1, "-").concat(nodeId),
                                            source: previousNodeId_1,
                                            target: nodeId,
                                            type: 'smoothstep'
                                        });
                                        previousNodeId_1 = nodeId;
                                        currentY_1 += 150;
                                    });
                                    newFlowDefinition = { nodes: nodes_1, edges: edges_1 };
                                    // Apply Update
                                    return [4 /*yield*/, prisma.automationRule.update({
                                            where: { id: rule.id },
                                            data: {
                                                flowDefinition: newFlowDefinition,
                                                eventType: 'message_received',
                                                isActive: true
                                            }
                                        })];
                                case 3:
                                    // Apply Update
                                    _b.sent();
                                    console.log("Successfully migrated Rule ".concat(rule.id, " to Flow Graph (").concat(nodes_1.length, " nodes, ").concat(edges_1.length, " edges)."));
                                    return [3 /*break*/, 5];
                                case 4:
                                    err_1 = _b.sent();
                                    console.error("Failed to migrate rule ".concat(rule.id, ":"), err_1.message);
                                    return [3 /*break*/, 5];
                                case 5: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, rules_1 = rules;
                    _a.label = 2;
                case 2:
                    if (!(_i < rules_1.length)) return [3 /*break*/, 5];
                    rule = rules_1[_i];
                    return [5 /*yield**/, _loop_1(rule)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    console.log('Migration complete.');
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .catch(function (e) {
    console.error(e);
    process.exit(1);
})
    .finally(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
