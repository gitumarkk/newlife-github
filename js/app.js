var App = {};
App.urls = {
    issues_root: function(state) {
        return "https://api.github.com/repos/newlif/teams/issues?state=" + state;
    },
    issue_comments: function(number_id) {
        return "https://api.github.com/repos/newlif/teams/issues/" + number_id + "/comments";
    }
};

App.GithubIssuesModel = Backbone.Model.extend({
    urlRoot: "https://api.github.com/repos/newlif/teams/issues",
});

App.GithubIssuesCollection = Backbone.Collection.extend({
    model: App.GithubIssuesModel,
    url: App.urls.issues_root("open"),
    comparator: function(m) {
        var self = this;
        return Date.parse(m.get("milestone").due_on);
    },

    helper_labels: function(model_items) {
        var self = this;
        // flatten transforms  [[1], [2]] to [1, 2]
        var labels = _.flatten(_.map(model_items, function (item) {
            return item.attributes.labels;
        }));
        return _.sortBy(_.uniq(labels, function(item) { return item.name; }), "name");
    },

    /**
    * Abstracts filtering model by label
    * @params {object} model -  the model instanc the collection
    * @params {string} label - the label to be compared
    * @returns {boolean} - Does model have the labels
    */
    helper_filter_label: function(model, label) {
        var self = this;
        var labels = _.map(_.flatten(model.get("labels")), function(item) {
            return item.name;
        });
        return labels.indexOf(label) !== -1;
    },

    git_labels: function() {
        var self = this;
        return self.helper_labels(self.models);
    },

    getCollectionLabel: function(label) {
        var self = this;
        var filteredCollection = this.filter(function(model) {
            return self.helper_filter_label(model, label);
        });
        return _.map(filteredCollection, function(model) {
            return model.attributes;
        });
    },

    groupByMilestones: function() {
        var self = this,
            models = self.models,

            // Grouping the models by the milestone title
            grouped =  _.groupBy(models, function(model) {
                return model.attributes.milestone.title;
            });

            // Grouping the labels in each milestone by the label title
            new_group = _.map(grouped, function(grouped_models, key) {
                var temp_value,
                    output_dict = {},
                    grouped_label_dict = {},
                    labels = self.git_labels();

                // For each label filter the models according to the label and add the label as a key
                // to the output dictionary
                _.each(labels, function(label) {
                    grouped_label_dict[label.name] = _.filter(grouped_models, function(model) {
                        return self.helper_filter_label(model, label.name);
                    });
                });
                output_dict["milestone"] = key;
                output_dict["data"] = grouped_label_dict;
                return output_dict;
            });
            return new_group;
    }
});

App.GithubCommentsModel = Backbone.Model.extend({
    idAttribute: "id",
    initialize: function(options) {
        var self = this;
        self.instanceUrl = options.url;
        return self;
    },
    url: function() {
        var self = this;
        return self.instanceUrl;
    }
});

App.GithubCommentsCollection = Backbone.Collection.extend({
    model: App.GithubCommentsModel,
    initialize: function(options) {
        var self = this;
        self.instanceUrl = options.url;
        return self;
    },
    url: function() {
        var self = this;
        return self.instanceUrl;
    }
});


App.AppView = Backbone.View.extend({
    el: "#workspace",
    git_collection: new App.GithubIssuesCollection(),
    git_comment_collection: undefined,
    events: {
        "click .issues-nav a": "renderLabel",
        "click .view-issue": "viewIssue"
    },
    initialize: function(options) {
        var self = this;
        _.bindAll(
            self,
            "render",
            "renderLabel",
            "viewIssue",
            "renderComments",
            "gitFetchError");

        self.issues_template = _.template($("#github-issues-template").html());
        self.comments_template = _.template($("#github-issue-comments-template").html());
        self.milestones_template = _.template($("#github-milestones-template").html());

        self.git_collection.fetch({
            success: self.render,
            error: self.gitFetchError
        });

        return this;
    },
    /**
    * Rendering the main workspace view and populating labels. Also renders
    * overall issues
    */
    render: function() {
        var self = this,
            labels = self.git_collection.git_labels(),
            milestones = self.git_collection.groupByMilestones();

        // _.each(labels, function(label) {
        //     self.$("#issues-nav").append(
        //         '<li role="presentation" class="issues-nav"><a data-label="' + label.name +
        //         '" href="#">' + label.name + '</a></li>');
        // });

        // self.$("#workspace-items").html(self.issues_template({
        //     issues: self.git_collection.toJSON()
        // }));

        _.each(milestones, function(value, key) {
            self.$("#workspace-items").append(self.milestones_template(value));
        });
    },

    renderLabel: function(ev) {
        var self = this,
            $element = $(ev.currentTarget),
            label = $element.data("label");

        self.$("#issue-nav li").removeClass("active");

        ev.preventDefault();

        if (label === "default") {
            self.$("#workspace-items").html(self.issues_template({
                issues: self.git_collection.toJSON()
            }));
        } else {
            self.$("#workspace-items").html(self.issues_template({
                issues: self.git_collection.getCollectionLabel(label)
            }));
        }
        $element.addClass("active");
    },

    viewIssue: function(ev) {
        var self = this, $element;
        ev.preventDefault();
        $element = $(ev.currentTarget);
        self.git_comment_collection = new App.GithubCommentsCollection({
            url: $element.data("comments-url")
        });
        self.git_comment_collection.fetch({
            success: self.renderComments,
            error: self.gitFetchError
        });
    },

    renderComments: function() {
        var self = this, comments;
        comments = self.git_comment_collection.toJSON();
        _.each(comments, function(comment) {
            var issue = self.git_collection.findWhere({
                url: comment.issue_url
            });

            if (issue) {
                comment.issue_title = issue.attributes.title;
            }
        });

        self.$("#workspace-items").html(self.comments_template({comments: comments}));
    },

    renderGroupByMilestones: function() {
        var self = this,
            milestone_col = self.git_collection.groupByMilestones();

    },

    gitFetchError: function(response, options, status) {
        var self = this;
        console.error(response, options);
    },
    getIssueTitleForComments: function(comments_url) {
        var self = this;
    },
});

$(document).ready(function() {
    new App.AppView({});
});
