/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import * as cdk from "@aws-cdk/core";
import * as kms from "@aws-cdk/aws-kms";
import * as codebuild from "@aws-cdk/aws-codebuild";
import * as iam from "@aws-cdk/aws-iam";
import * as s3 from "@aws-cdk/aws-s3";

export interface GitHubIntegrationProps {
  readonly githubOrg: string;
  readonly bucketArn: string;
  readonly region: string;
  readonly accountId: string;
  readonly decryptArns: string[];
}

export class GitHubIntegration extends cdk.Construct {
  private readonly props: GitHubIntegrationProps;
  private readonly idp: iam.OpenIdConnectProvider;
  public readonly dispatcherCodeBuildProject: codebuild.Project;

  constructor(scope: cdk.Construct, id: string, props: GitHubIntegrationProps) {
    super(scope, id);
    this.props = props;
    this.idp = new iam.OpenIdConnectProvider(this, "OidProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    if (!props.githubOrg) {
      throw new Error("Missing GitHub organization");
    }

    const artifactsBucket = s3.Bucket.fromBucketArn(
      this,
      "ArtifactsBucket",
      props.bucketArn
    );
    const artifactsEncryptionKey = new kms.Key(this, "ArtifactsEncryptionKey", {
      description:
        "KMS key for the Dispatcher CodeBuild project to use for encrypting artifacts",
      alias: "github-dispatcher-codebuild-key",
      enableKeyRotation: true,
    });

    props.decryptArns.forEach((roleArn) => {
      artifactsEncryptionKey.grantEncryptDecrypt(new iam.ArnPrincipal(roleArn));
    });

    this.dispatcherCodeBuildProject = new codebuild.Project(
      this,
      "GitHubDispatcherCodeBuildProject",
      {
        projectName: "GitHubDispatcher",
        environment: {
          buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2,
        },
        buildSpec: codebuild.BuildSpec.fromObject({
          version: "0.2",
          artifacts: {
            files: ["**/*"],
            name: "github/$GITHUB_REPOSITORY/$GITHUB_REF_NAME/artifact.zip",
          },
        }),
        artifacts: codebuild.Artifacts.s3({
          bucket: artifactsBucket,
          packageZip: true,
          includeBuildId: false,
        }),
        encryptionKey: artifactsEncryptionKey,
      }
    );
    const codeBuildCfnRole = this.dispatcherCodeBuildProject.role?.node
      .defaultChild as iam.CfnRole;
    codeBuildCfnRole?.addPropertyOverride(
      "RoleName",
      "GitHubDispatcherCodeBuildServiceRole"
    );

    const gitHubDispatcherRole = this.createGitHubRole(
      "Dispatcher",
      this.dispatcherCodeBuildProject
    );

    new cdk.CfnOutput(this, "ArtifactsBucketARN", {
      description: "ARN of the artifact's bucket",
      value: artifactsBucket.bucketArn,
    });

    new cdk.CfnOutput(this, "GitHubDispatcherIamRole", {
      description:
        "ARN of the IAM Role that GitHub assumes to run the Dispatcher CodeBuild project",
      value: gitHubDispatcherRole.roleArn,
    });

    new cdk.CfnOutput(this, "GitHubDispatcherCodeBuildProjectName", {
      description: "Name of the GitHub Dispatcher CodeBuild Project",
      value: this.dispatcherCodeBuildProject.projectName,
    });
  }

  createGitHubRole(
    type: string,
    codeBuildProject: codebuild.Project
  ): iam.Role {
    return new iam.Role(this, `GitHub${type}Role`, {
      roleName: `GitHubIntegration-CodeBuild-${type}-Role`,
      assumedBy: new iam.FederatedPrincipal(
        this.idp.openIdConnectProviderArn,
        {
          StringLike: {
            "token.actions.githubusercontent.com:sub": `repo:${this.props.githubOrg}/*`,
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
      inlinePolicies: {
        AllowBuilds: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["codebuild:StartBuild", "codebuild:BatchGetBuilds"],
              resources: [codeBuildProject.projectArn],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["logs:GetLogEvents"],
              resources: [
                `arn:aws:logs:${this.props.region}:${this.props.accountId}:log-group:/aws/codebuild/${codeBuildProject.projectName}:*`,
              ],
            }),
          ],
        }),
      },
    });
  }
}
