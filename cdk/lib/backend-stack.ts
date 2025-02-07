/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import * as cdk from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as apigateway from "@aws-cdk/aws-apigateway";
import { BackendApi } from "./constructs/api";
import { Database } from "./constructs/database";
import { LambdaFunctions } from "./constructs/lambdas";
import { DatasetStorage } from "./constructs/datastorage";
import { ContentStorage } from "./constructs/contentstorage";

interface BackendStackProps extends cdk.StackProps {
  userPool: {
    id: string;
    arn: string;
  };
  datasetsBucketName: string;
  contentBucketName: string;
  authenticationRequired: boolean;
}

export class BackendStack extends cdk.Stack {
  public readonly privateApiFunction: lambda.Function;
  public readonly publicApiFunction: lambda.Function;
  public readonly dynamodbStreamsFunction: lambda.Function;
  public readonly mainTable: dynamodb.Table;
  public readonly auditTrailTable: dynamodb.Table;
  public readonly restApi: apigateway.RestApi;
  public readonly datasetsBucketArn: string;

  constructor(scope: cdk.Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const dataStorage = new DatasetStorage(this, "DatasetStorage", {
      datasetsBucketName: props.datasetsBucketName,
    });

    const contentStorage = new ContentStorage(this, "ContentStorage", {
      contentBucketName: props.contentBucketName,
    });

    const database = new Database(this, "Database");
    const lambdas = new LambdaFunctions(this, "Functions", {
      mainTable: database.mainTable,
      auditTrailTable: database.auditTrailTable,
      datasetsBucket: dataStorage.datasetsBucket,
      contentBucket: contentStorage.contentBucket,
      userPool: props.userPool,
      authenticationRequired: props.authenticationRequired,
    });

    const backendApi = new BackendApi(this, "Api", {
      cognitoUserPoolArn: props.userPool.arn,
      apiFunction: lambdas.apiHandler,
      publicApiFunction: lambdas.publicApiHandler,
      authenticationRequired: props.authenticationRequired,
    });

    /**
     * Outputs
     */
    this.privateApiFunction = lambdas.apiHandler;
    this.publicApiFunction = lambdas.publicApiHandler;
    this.dynamodbStreamsFunction = lambdas.ddbStreamProcessor;
    this.mainTable = database.mainTable;
    this.restApi = backendApi.api;
    this.datasetsBucketArn = dataStorage.datasetsBucket.bucketArn;

    new cdk.CfnOutput(this, "ApiGatewayEndpoint", {
      value: this.restApi.url,
    });

    new cdk.CfnOutput(this, "DynamoDbTableName", {
      value: database.mainTable.tableName,
    });

    new cdk.CfnOutput(this, "DatasetsBucketName", {
      value: dataStorage.datasetsBucket.bucketName,
    });
  }
}
