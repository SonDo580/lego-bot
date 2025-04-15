import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as lex from "aws-cdk-lib/aws-lex";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as destinations from "aws-cdk-lib/aws-logs-destinations";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export class LegoBotWithCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const localeId = "en_US";
    const stackName = this.stackName.toLowerCase();

    const botTextLogGroup = new logs.LogGroup(this, "LegoBotTextLogGroup", {
      logGroupName: `lego-bot-${stackName}`,
    });

    const botTextLogArchiveBucket = new s3.Bucket(this, "LogArchiveBucket", {
      bucketName: `lego-bot-logs-${stackName}`,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const legoOrdersTable = new dynamodb.Table(this, "LegoOrdersTable", {
      tableName: `LegoOrders-${stackName}`,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const commonPolicyForLambda = [
      new iam.PolicyStatement({
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["*"],
      }),
    ];

    const streamLogFunctionRole = new iam.Role(this, "StreamLogFunctionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      inlinePolicies: {
        StreamLogFunctionPolicy: new iam.PolicyDocument({
          statements: [
            ...commonPolicyForLambda,
            new iam.PolicyStatement({
              actions: ["s3:PutObject"],
              resources: [botTextLogArchiveBucket.bucketArn],
            }),
          ],
        }),
      },
    });

    const orderFunctionRole = new iam.Role(this, "LegoOrderFunctionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      inlinePolicies: {
        StreamLogFunctionPolicy: new iam.PolicyDocument({
          statements: [
            ...commonPolicyForLambda,
            new iam.PolicyStatement({
              actions: ["dynamodb:PutItem"],
              resources: [legoOrdersTable.tableArn],
            }),
          ],
        }),
      },
    });

    const lambdasBasePath = path.join(__dirname, "..", "lambdas");

    const streamLogFunction = new lambda.Function(this, "StreamLogFunction", {
      functionName: `LegoBotLogStreamer-${stackName}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      role: streamLogFunctionRole,
      environment: {
        BUCKET_NAME: botTextLogArchiveBucket.bucketArn,
        PREFIX: "",
      },
      code: lambda.Code.fromAsset(path.join(lambdasBasePath, "stream-logs")),
    });

    const legoOrderFunction = new lambda.Function(this, "LegoOrderFunction", {
      functionName: "LegoOrderFunction",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      role: orderFunctionRole,
      environment: {
        TABLE_NAME: legoOrdersTable.tableName,
      },
      code: lambda.Code.fromAsset(
        path.join(lambdasBasePath, "validate-input-and-save-order")
      ),
    });

    new logs.SubscriptionFilter(this, "LegoBotLogGroupSubscription", {
      logGroup: botTextLogGroup,
      filterPattern: logs.FilterPattern.allEvents(),
      destination: new destinations.LambdaDestination(streamLogFunction),
    });

    const botRuntimeRole = new iam.Role(this, "BotRuntimeRole", {
      assumedBy: new iam.ServicePrincipal("lexv2.amazonaws.com"),
      inlinePolicies: {
        LexRuntimeRolePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["polly:SynthesizeSpeech", "comprehend:DetectSentiment"],
              resources: ["*"],
            }),
            new iam.PolicyStatement({
              actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
              resources: [botTextLogGroup.logGroupArn],
            }),
          ],
        }),
      },
    });

    const legoBot = new lex.CfnBot(this, "LegoBot", {
      name: `LegoBot-${stackName}`,
      roleArn: botRuntimeRole.roleArn,
      dataPrivacy: {
        ChildDirected: false,
      },
      idleSessionTtlInSeconds: 300,
      autoBuildBotLocales: false,
      botLocales: [
        {
          localeId,
          nluConfidenceThreshold: 0.4,
          voiceSettings: {
            voiceId: "Ivy",
          },
          slotTypes: [
            {
              name: "LegoSizes",
              slotTypeValues: [
                { sampleValue: { value: "small" } },
                { sampleValue: { value: "medium" } },
                { sampleValue: { value: "large" } },
              ],
              valueSelectionSetting: {
                resolutionStrategy: "ORIGINAL_VALUE",
              },
            },
            {
              name: "LegoModels",
              slotTypeValues: [
                { sampleValue: { value: "ship" } },
                { sampleValue: { value: "tank" } },
                { sampleValue: { value: "rocket" } },
              ],
              valueSelectionSetting: {
                resolutionStrategy: "ORIGINAL_VALUE",
              },
            },
          ],
          intents: [
            {
              name: "OrderLego",
              sampleUtterances: [
                { utterance: "Lego" },
                { utterance: "I'd like to order a lego" },
                { utterance: "I want a {LegoSize} lego" },
                { utterance: "I want a {LegoModel} lego" },
                { utterance: "I want a {LegoSize} {LegoModel} lego" },
              ],
              intentConfirmationSetting: {
                promptSpecification: {
                  messageGroupsList: [
                    {
                      message: {
                        plainTextMessage: {
                          value:
                            "Would you like me to order your {LegoSize} {LegoModel}?",
                        },
                      },
                    },
                  ],
                  maxRetries: 3,
                  allowInterrupt: false,
                },
                declinationResponse: {
                  messageGroupsList: [
                    {
                      message: {
                        plainTextMessage: {
                          value: "Good luck finding it yourself.",
                        },
                      },
                    },
                  ],
                  allowInterrupt: false,
                },
              },
              slots: [
                {
                  name: "LegoSize",
                  slotTypeName: "LegoSizes",
                  valueElicitationSetting: {
                    slotConstraint: "Required",
                    promptSpecification: {
                      messageGroupsList: [
                        {
                          message: {
                            plainTextMessage: {
                              value: "Which lego size do you want?",
                            },
                          },
                        },
                      ],
                      maxRetries: 3,
                      allowInterrupt: false,
                    },
                  },
                },
                {
                  name: "LegoModel",
                  slotTypeName: "LegoModels",
                  valueElicitationSetting: {
                    slotConstraint: "Required",
                    promptSpecification: {
                      messageGroupsList: [
                        {
                          message: {
                            plainTextMessage: {
                              value: "Which lego model do you want?",
                            },
                          },
                        },
                      ],
                      maxRetries: 3,
                      allowInterrupt: false,
                    },
                  },
                },
              ],
              slotPriorities: [
                {
                  priority: 1,
                  slotName: "LegoModel",
                },
                {
                  priority: 2,
                  slotName: "LegoSize",
                },
              ],
              dialogCodeHook: {
                enabled: true,
              },
              fulfillmentCodeHook: {
                enabled: true,
                postFulfillmentStatusSpecification: {
                  successResponse: {
                    messageGroupsList: [
                      {
                        message: {
                          plainTextMessage: {
                            value: "Your order is on the way.",
                          },
                        },
                      },
                    ],
                    allowInterrupt: false,
                  },
                  failureResponse: {
                    messageGroupsList: [
                      {
                        message: {
                          plainTextMessage: {
                            value: "Something went wrong. Try again.",
                          },
                        },
                      },
                    ],
                    allowInterrupt: false,
                  },
                },
              },
            },
            {
              name: "FallbackIntent",
              parentIntentSignature: "AMAZON.FallbackIntent",
              intentClosingSetting: {
                closingResponse: {
                  messageGroupsList: [
                    {
                      message: {
                        plainTextMessage: {
                          value: "Sorry, I can't help you with that.",
                        },
                      },
                    },
                  ],
                  allowInterrupt: false,
                },
              },
            },
          ],
        },
      ],
    });

    const botVersion = new lex.CfnBotVersion(this, "LegoBotVersion", {
      botId: legoBot.ref,
      botVersionLocaleSpecification: [
        {
          localeId,
          botVersionLocaleDetails: {
            sourceBotVersion: "DRAFT",
          },
        },
      ],
    });

    const firstBotAlias = new lex.CfnBotAlias(this, "LegoBotAlias", {
      botAliasName: "LegoBotVersion1Alias",
      botId: legoBot.ref,
      botVersion: botVersion.attrBotVersion,
      botAliasLocaleSettings: [
        {
          localeId,
          botAliasLocaleSetting: {
            enabled: true,
            codeHookSpecification: {
              lambdaCodeHook: {
                lambdaArn: legoOrderFunction.functionArn,
                codeHookInterfaceVersion: "1.0",
              },
            },
          },
        },
      ],
      conversationLogSettings: {
        textLogSettings: [
          {
            enabled: true,
            destination: {
              cloudWatch: {
                cloudWatchLogGroupArn: botTextLogGroup.logGroupArn,
                logPrefix: "",
              },
            },
          },
        ],
      },
    });

    streamLogFunction.addPermission("InvokedByCloudWatchLogs", {
      principal: new iam.ServicePrincipal("logs.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: botTextLogGroup.logGroupArn,
    });

    legoOrderFunction.addPermission("InvokedByLex", {
      principal: new iam.ServicePrincipal("lexv2.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: firstBotAlias.attrArn,
    });
  }
}
